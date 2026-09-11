#!/bin/bash
set -euo pipefail
cd /opt/vwo
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/vwo-releases
tar -czf /root/vwo-releases/before-leadership-$stamp.tar.gz server web
runuser -u vwo -- /usr/local/bin/node --env-file=.env server/backup.mjs
systemctl stop vwo
trap 'systemctl start vwo' EXIT
tar -xzf /root/mission-leadership-update.tar.gz -C /opt/vwo
chown root:vwo server/db.mjs server/index.mjs web/site.js web/admin.js web/content-editor.js web/styles.css
chmod 640 server/db.mjs server/index.mjs web/site.js web/admin.js web/content-editor.js web/styles.css
systemctl start vwo
trap - EXIT
for attempt in 1 2 3 4 5; do
 if curl -fsS http://127.0.0.1:3000/api/health; then break; fi
 sleep 1
done
node --input-type=module - <<'JS'
const data=await (await fetch('https://vwokarati.com/api/public')).json();
if(data.settings.mission!=='Worship, winning souls, and community')throw Error('Mission not updated');
if(!data.content.some(c=>c.kind==='leader'&&c.title==='Pastor Kamau'&&c.position==='Reverend Pastor'))throw Error('Leader missing');
console.log('Live mission and leadership content verified.');
JS
