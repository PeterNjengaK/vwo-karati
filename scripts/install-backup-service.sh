#!/bin/bash
set -euo pipefail
cd /opt/vwo
mkdir -p /root/vwo-releases
tar -czf /root/vwo-releases/before-backup-automation.tar.gz server/operations.mjs web/office-features.js
runuser -u vwo -- node --env-file=.env server/backup.mjs
tar -xzf /root/backup-automation.tar.gz
chown root:vwo server/operations.mjs server/scheduled-backup.mjs web/office-features.js
chmod 640 server/operations.mjs server/scheduled-backup.mjs web/office-features.js
cat > /etc/systemd/system/vwo-backup.service <<'UNIT'
[Unit]
Description=Verified daily church database backup
[Service]
Type=oneshot
User=vwo
Group=vwo
WorkingDirectory=/opt/vwo
ExecStart=/usr/local/bin/node --env-file=/opt/vwo/.env /opt/vwo/server/scheduled-backup.mjs
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/vwo/data
UNIT
cat > /etc/systemd/system/vwo-backup.timer <<'UNIT'
[Unit]
Description=Daily church backup at 02:00 Kenya time
[Timer]
OnCalendar=*-*-* 23:00:00 UTC
Persistent=true
Unit=vwo-backup.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now vwo-backup.timer
systemctl start vwo-backup.service
systemctl restart vwo
systemctl list-timers vwo-backup.timer --no-pager
cat /opt/vwo/data/backups/scheduled-status.json
