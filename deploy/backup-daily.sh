#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/run/soloop-deploy.lock
flock -n 9 || exit 0
[[ -f /var/lib/soloop/soloop.db ]] || exit 0
python3 /opt/soloop/current/deploy/backup.py /var/lib/soloop/soloop.db "/var/backups/soloop/daily-$(date -u +%Y%m%dT%H%M%SZ).db"
# Retain 30 days of daily snapshots; pre-deployment snapshots are kept separately.
find /var/backups/soloop -maxdepth 1 -type f -name 'daily-*.db' -mtime +30 -delete
