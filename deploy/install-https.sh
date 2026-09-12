#!/usr/bin/env bash
# Run as root after activating a release. Changes only the Soloop virtual host.
set -euo pipefail
: "${SOLOOP_HOST:?Set SOLOOP_HOST to your public hostname}"
[[ "$SOLOOP_HOST" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ && ${#SOLOOP_HOST} -le 253 ]] || { echo 'Invalid hostname.' >&2; exit 1; }
export SOLOOP_HOST
[[ "$EUID" -eq 0 ]] || exit 1
config=/etc/nginx/sites-available/${SOLOOP_HOST}
enabled=/etc/nginx/sites-enabled/${SOLOOP_HOST}
source_dir="$(cd "$(dirname "$0")" && pwd)"
backup="$(mktemp)"
had_config=false
had_enabled=false
if [[ -f "$config" ]]; then cp "$config" "$backup"; had_config=true; fi
if [[ -e "$enabled" || -L "$enabled" ]]; then
    [[ "$(readlink -f "$enabled")" == "$config" ]] || { echo 'Unexpected nginx symlink.' >&2; exit 1; }
    had_enabled=true
fi
finish() {
    status=$?
    trap - EXIT
    set +e
    if [[ "$status" -ne 0 ]]; then
        if [[ "$had_config" == true ]]; then cp "$backup" "$config"; else rm -f "$config"; fi
        if [[ "$had_enabled" == false ]]; then rm -f "$enabled"; fi
        nginx -t && systemctl reload nginx
    fi
    rm -f "$backup"
    exit "$status"
}
trap finish EXIT
install -d -m 0755 /var/www/soloop-acme
if [[ ! -f /etc/letsencrypt/live/${SOLOOP_HOST}/fullchain.pem ]]; then
    cat > "$config" <<NGINX
server {
    listen 80;
    server_name ${SOLOOP_HOST};
    location ^~ /.well-known/acme-challenge/ { root /var/www/soloop-acme; }
    location / { return 503; }
}
NGINX
    ln -sfn "$config" "$enabled"
    nginx -t
    systemctl reload nginx
    certbot certonly --webroot --webroot-path /var/www/soloop-acme --domain ${SOLOOP_HOST} --non-interactive --keep-until-expiring
fi
sed "s/__SOLOOP_HOST__/$SOLOOP_HOST/g" "$source_dir/soloop.nginx.conf" > "$config"
chmod 0644 "$config"
ln -sfn "$config" "$enabled"
sed "s/__SOLOOP_HOST__/$SOLOOP_HOST/g" "$source_dir/renew-cert.sh" > /etc/letsencrypt/renewal-hooks/deploy/soloop.sh
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/soloop.sh
nginx -t
systemctl reload nginx
# nginx reload is asynchronous; old workers can briefly serve the prior default
# certificate. Retry while still requiring normal hostname/chain validation.
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 --max-time 10 https://${SOLOOP_HOST}/ -o /dev/null
