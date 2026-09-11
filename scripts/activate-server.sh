#!/bin/bash
set -euo pipefail
test ! -f /opt/vwo/data/church.sqlite || { echo 'Existing production database found; refusing to overwrite.'; exit 1; }
tar -xzf /root/vwo-release.tar.gz -C /opt/vwo
install -o vwo -g vwo -m 600 /root/vwo-church.sqlite /opt/vwo/data/church.sqlite
chown -R root:vwo /opt/vwo/server /opt/vwo/web /opt/vwo/Website /opt/vwo/ChurchRegister
chmod -R g+rX,o-rwx /opt/vwo/server /opt/vwo/web /opt/vwo/Website /opt/vwo/ChurchRegister
cat > /opt/vwo/.env <<'ENV'
NODE_ENV=production
PUBLIC_ORIGIN=https://vwokarati.com
HOST=127.0.0.1
PORT=3000
DATABASE_PATH=/opt/vwo/data/church.sqlite
TRUST_LOCAL_PROXY=true
MPESA_MODE=disabled
ENV
chown root:vwo /opt/vwo/.env
chmod 640 /opt/vwo/.env
cd /opt/vwo
runuser -u vwo -- node --input-type=module - <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('/opt/vwo/data/church.sqlite');
if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Database integrity check failed');
db.exec('DELETE FROM sessions; DELETE FROM limits;');
console.log('Migrated members:',db.prepare('SELECT COUNT(*) n FROM members').get().n);
db.close();
JS
cat > /etc/systemd/system/vwo.service <<'SERVICE'
[Unit]
Description=VWO Karati church system
After=network.target
[Service]
Type=simple
User=vwo
Group=vwo
WorkingDirectory=/opt/vwo
ExecStart=/usr/local/bin/node --env-file=/opt/vwo/.env /opt/vwo/server/index.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/opt/vwo/data
[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --now vwo
mkdir -p /var/www/vwo-acme
cat > /etc/nginx/sites-available/vwo <<'NGINX'
server {
 listen 80;
 server_name vwokarati.com www.vwokarati.com;
 location /.well-known/acme-challenge/ { root /var/www/vwo-acme; }
 location / { return 503; }
}
NGINX
ln -sfn /etc/nginx/sites-available/vwo /etc/nginx/sites-enabled/vwo
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/www/vwo-acme -d vwokarati.com -d www.vwokarati.com --non-interactive --agree-tos --register-unsafely-without-email
cat > /etc/nginx/sites-available/vwo <<'NGINX'
server {
 listen 80;
 server_name vwokarati.com www.vwokarati.com;
 location /.well-known/acme-challenge/ { root /var/www/vwo-acme; }
 location / { return 301 https://vwokarati.com$request_uri; }
}
server {
 listen 443 ssl;
 server_name www.vwokarati.com;
 ssl_certificate /etc/letsencrypt/live/vwokarati.com/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/vwokarati.com/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 return 301 https://vwokarati.com$request_uri;
}
server {
 listen 443 ssl;
 server_name vwokarati.com;
 ssl_certificate /etc/letsencrypt/live/vwokarati.com/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/vwokarati.com/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 client_max_body_size 8m;
 access_log off;
 location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_read_timeout 60s;
 }
}
NGINX
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nnginx -t && systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/vwo-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/vwo-nginx
nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer
curl --fail --silent https://vwokarati.com/api/health
systemctl is-active vwo nginx
