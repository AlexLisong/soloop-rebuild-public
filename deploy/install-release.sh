#!/usr/bin/env bash
# Run as root: bash install-release.sh /path/to/<release>.tar.gz
set -euo pipefail
: "${SOLOOP_HOST:?Set SOLOOP_HOST to your public hostname}"
[[ "$SOLOOP_HOST" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ && ${#SOLOOP_HOST} -le 253 ]] || { echo 'Invalid hostname.' >&2; exit 1; }
export SOLOOP_HOST
[[ "$EUID" -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
exec 9>/run/soloop-deploy.lock
flock -n 9 || { echo "Another Soloop deployment is running." >&2; exit 1; }
archive="$(realpath "${1:?Provide the release archive}")"
release="$(basename "$archive" .tar.gz)"
[[ "$release" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$ ]] || exit 1
target="/opt/soloop/releases/$release"
[[ ! -e "$target" ]] || { echo 'Release already installed.' >&2; exit 1; }
/usr/bin/node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<13))process.exit(1)'
id soloop >/dev/null 2>&1 || useradd --system --home-dir /var/lib/soloop --shell /usr/sbin/nologin soloop
install -d -m 0755 /opt/soloop/releases
id soloop-api >/dev/null 2>&1 || useradd --system --home-dir /var/lib/soloop --shell /usr/sbin/nologin soloop-api
install -d -o soloop-api -g soloop-api -m 0700 /var/lib/soloop
install -d -o soloop -g soloop -m 0750 /var/cache/soloop
[[ -f /etc/soloop/app.env ]] || { echo 'Configure /etc/soloop/app.env first.' >&2; exit 1; }
[[ "$(stat -c %a /etc/soloop/app.env)" == 600 ]] || { echo 'Environment file must be mode 0600.' >&2; exit 1; }
python3 - "$archive" "$target" "$release" <<'PY'
import hashlib, json, pathlib, sys, tarfile
archive, target, release = sys.argv[1:]
with tarfile.open(archive) as bundle:
    members = bundle.getmembers()
    names = [member.name for member in members]
    if len(names) != len(set(names)):
        raise SystemExit('Duplicate archive paths.')
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if not member.isfile() or path.is_absolute() or '..' in path.parts:
            raise SystemExit('Unsafe archive entry.')
    manifest = json.load(bundle.extractfile('release.json'))
    if manifest['release'] != release or set(manifest['files']) != set(names) - {'release.json'}:
        raise SystemExit('Release manifest mismatch.')
    for name, digest in manifest['files'].items():
        if hashlib.sha256(bundle.extractfile(name).read()).hexdigest() != digest:
            raise SystemExit('Release checksum mismatch.')
    bundle.extractall(target, filter='data')
PY
chown -R soloop:soloop "$target"
# Dependency lifecycle scripts run without root privileges.
runuser -u soloop -- env npm_config_cache=/var/cache/soloop/npm bash -c 'cd "$1" && npm run install:ci' -- "$target"
chown -R root:root "$target"
chmod -R go-w "$target"
previous="$(readlink -f /opt/soloop/current || true)"
install -d -m 0700 /var/backups/soloop
backup_dir="$(mktemp -d "/var/backups/soloop/activation-$release.XXXXXX")"
for name in soloop.service soloop-api.service soloop-backup.service soloop-backup.timer; do
    [[ ! -f "/etc/systemd/system/$name" ]] || cp "/etc/systemd/system/$name" "$backup_dir/$name"
done
config=/etc/nginx/sites-available/${SOLOOP_HOST}
[[ ! -f "$config" ]] || cp "$config" "$backup_dir/nginx.conf"
db_backup="/var/backups/soloop/before-$release.db"
had_db=false
[[ ! -f /var/lib/soloop/soloop.db ]] || had_db=true
had_enabled=false
[[ ! -L /etc/nginx/sites-enabled/${SOLOOP_HOST} ]] || had_enabled=true
db_backed_up=false
activation_started=false
maintenance_created=false
stop_api() {
    if [[ "$(systemctl show soloop-api.service -p LoadState --value)" != not-found ]]; then
        systemctl stop soloop-api.service || return 1
        [[ "$(systemctl show soloop-api.service -p MainPID --value)" == 0 ]] || return 1
        ! systemctl is-active --quiet soloop-api.service || return 1
    fi
}
ui_health() {
    curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 --connect-timeout 2 --max-time 3 http://127.0.0.1:8013/ |
        python3 -c 'import sys; body=sys.stdin.read(); sys.exit(0 if "From a rough idea to work you can use" in body else 1)'
}
api_health() {
    curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 --connect-timeout 2 --max-time 3 http://127.0.0.1:8014/api/health |
        python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") and d.get("aiReady") else 1)'
}
rollback() {
    stop_api || return 1
    systemctl stop soloop.service || return 1
    if [[ -f /etc/systemd/system/soloop-backup.timer ]]; then
        systemctl stop soloop-backup.timer || return 1
    fi
    for name in soloop.service soloop-api.service soloop-backup.service soloop-backup.timer; do
        if [[ -f "$backup_dir/$name" ]]; then
            if [[ "$name" == soloop.service ]]; then
                # Keep security hardening: legacy StateDirectory chowns API data.
                install -m 0644 "$target/deploy/soloop.service" "/etc/systemd/system/$name" || return 1
            else
                install -m 0644 "$backup_dir/$name" "/etc/systemd/system/$name" || return 1
            fi
        elif [[ -f "/etc/systemd/system/$name" ]]; then
            systemctl disable "$name" || return 1
            rm -f "/etc/systemd/system/$name" || return 1
        fi
    done
    if [[ -f "$backup_dir/nginx.conf" ]]; then
        cp "$backup_dir/nginx.conf" "$config" || return 1
    else
        rm -f "$config" || return 1
    fi
    if [[ "$had_enabled" == false ]]; then
        rm -f /etc/nginx/sites-enabled/${SOLOOP_HOST} || return 1
    fi
    nginx -t && systemctl reload nginx || return 1
    if [[ "$db_backed_up" == true ]]; then
        install -o soloop-api -g soloop-api -m 0600 "$db_backup" /var/lib/soloop/soloop.db.restore || return 1
        rm -f /var/lib/soloop/soloop.db-wal /var/lib/soloop/soloop.db-shm || return 1
        mv -f /var/lib/soloop/soloop.db.restore /var/lib/soloop/soloop.db || return 1
    elif [[ "$had_db" == false ]]; then
        rm -f /var/lib/soloop/soloop.db /var/lib/soloop/soloop.db-wal /var/lib/soloop/soloop.db-shm || return 1
    fi
    rm -f /opt/soloop/current.next /opt/soloop/current.rollback || return 1
    if [[ -n "$previous" && -d "$previous" ]]; then
        ln -s "$previous" /opt/soloop/current.rollback || return 1
        mv -Tf /opt/soloop/current.rollback /opt/soloop/current || return 1
    else
        rm -f /opt/soloop/current || return 1
    fi
    systemctl daemon-reload || return 1
    if [[ -f "$backup_dir/soloop.service" ]]; then
        systemctl restart soloop.service && ui_health || return 1
    fi
    if [[ -f "$backup_dir/soloop-api.service" ]]; then
        systemctl restart soloop-api.service && api_health || return 1
    fi
    if [[ -f "$backup_dir/soloop-backup.timer" ]]; then
        systemctl start soloop-backup.timer || return 1
    fi
}
finish() {
    status=$?
    trap - EXIT
    set +e
    if [[ "$status" -ne 0 && "$activation_started" == true ]]; then
        echo 'Activation failed; restoring both services, code and database snapshot.' >&2
        if ! rollback; then
            printf 'Rollback needs operator recovery. Maintenance and backups retained: %s\n' "$backup_dir" >&2
            exit 1
        fi
    fi
    [[ "$maintenance_created" != true ]] || rm -f /var/lib/soloop-maintenance
    rm -rf "$backup_dir"
    exit "$status"
}
trap finish EXIT
[[ ! -e /var/lib/soloop-maintenance ]] || { echo 'Resolve the existing maintenance state first.' >&2; exit 1; }
install -m 0644 /dev/null /var/lib/soloop-maintenance
maintenance_created=true
activation_started=true
stop_api
for file in /var/lib/soloop/soloop.db /var/lib/soloop/soloop.db-wal /var/lib/soloop/soloop.db-shm; do
    [[ ! -f "$file" ]] || chown soloop-api:soloop-api "$file"
done
if [[ -f /var/lib/soloop/soloop.db ]]; then
    python3 "$target/deploy/backup.py" /var/lib/soloop/soloop.db "$db_backup"
    db_backed_up=true
fi
for unit in soloop soloop-api; do
    install -m 0644 "$target/deploy/$unit.service" "/etc/systemd/system/$unit.service"
done
ln -s "$target" /opt/soloop/current.next
mv -Tf /opt/soloop/current.next /opt/soloop/current
systemctl daemon-reload
systemctl enable soloop.service soloop-api.service
systemctl restart soloop-api.service soloop.service
ui_health
api_health
systemctl is-active --quiet soloop.service soloop-api.service
bash "$target/deploy/install-https.sh"
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 --max-time 10 https://${SOLOOP_HOST}/api/health | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") and d.get("aiReady") else 1)'
install -m 0644 "$target/deploy/soloop-backup.service" /etc/systemd/system/soloop-backup.service
install -m 0644 "$target/deploy/soloop-backup.timer" /etc/systemd/system/soloop-backup.timer
systemctl daemon-reload
systemctl enable --now soloop-backup.timer
# This is the final activation step; no failed rollback can remove this gate.
rm -f /var/lib/soloop-maintenance
maintenance_created=false
printf 'Healthy workspace release: %s\n' "$release"
