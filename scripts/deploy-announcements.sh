#!/bin/bash
set -euo pipefail
cd /opt/vwo
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/vwo-releases
tar -czf /root/vwo-releases/before-announcements-$stamp.tar.gz server web
runuser -u vwo -- node --env-file=.env server/backup.mjs
systemctl stop vwo
trap 'systemctl start vwo' EXIT
tar -xzf /root/announcements-update.tar.gz -C /opt/vwo
chown root:vwo server/index.mjs web/admin.js web/content-editor.js web/site.js web/styles.css
chmod 640 server/index.mjs web/admin.js web/content-editor.js web/site.js web/styles.css
systemctl start vwo
trap - EXIT
curl --retry 5 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3000/api/health
