#!/bin/bash
set -euo pipefail
cd /opt/vwo
tar -czf /root/vwo-releases/before-traffic.tar.gz server web
runuser -u vwo -- node --env-file=.env server/backup.mjs
systemctl stop vwo
trap 'systemctl start vwo' EXIT
tar -xzf /root/traffic-update.tar.gz
chown root:vwo server/index.mjs server/traffic.mjs web/admin.js web/office-features.js web/site.js
chmod 640 server/index.mjs server/traffic.mjs web/admin.js web/office-features.js web/site.js
systemctl start vwo
trap - EXIT
curl --retry 5 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3000/api/health
