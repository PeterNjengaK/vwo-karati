#!/bin/bash
set -euo pipefail
cd /opt/vwo
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tar -czf /root/vwo-releases/before-commerce-$stamp.tar.gz server web
runuser -u vwo -- node --env-file=.env server/backup.mjs
systemctl stop vwo
trap 'systemctl start vwo' EXIT
tar -xzf /root/commerce-update.tar.gz
chown root:vwo server/index.mjs server/commerce.mjs web/admin.js web/content-editor.js web/commerce-public.js web/site.js web/styles.css web/office-features.js
chmod 640 server/index.mjs server/commerce.mjs web/admin.js web/content-editor.js web/commerce-public.js web/site.js web/styles.css web/office-features.js
systemctl start vwo
trap - EXIT
curl --retry 5 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3000/api/health
systemctl start vwo-backup.service
