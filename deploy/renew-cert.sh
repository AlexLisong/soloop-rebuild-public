#!/bin/sh
if [ "$RENEWED_LINEAGE" = /etc/letsencrypt/live/__SOLOOP_HOST__ ]; then
    nginx -t && systemctl reload nginx
fi
