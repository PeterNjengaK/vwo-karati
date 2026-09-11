#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx curl xz-utils ufw
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
mkdir -p /opt/node-download
cd /opt/node-download
curl -fsSLO https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/v24.19.0/SHASUMS256.txt
grep ' node-v24.19.0-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
tar -xJf node-v24.19.0-linux-x64.tar.xz -C /opt
ln -sfn /opt/node-v24.19.0-linux-x64/bin/node /usr/local/bin/node
id vwo >/dev/null 2>&1 || useradd --system --home /opt/vwo --shell /usr/sbin/nologin vwo
install -d -o root -g vwo -m 750 /opt/vwo
install -d -o vwo -g vwo -m 700 /opt/vwo/data /opt/vwo/data/backups
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
node --version
