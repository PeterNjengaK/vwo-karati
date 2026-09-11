# Live church system

Deployed on 9 September 2026.

- Website: https://vwokarati.com
- Office: https://vwokarati.com/admin
- Desktop interface: https://vwokarati.com/desktop
- Server: 161.35.78.110, Ubuntu 24.04, Node.js 24.19.0
- Application: /opt/vwo, systemd service `vwo`
- Database: /opt/vwo/data/church.sqlite, accessible only to the service account and server administrator
- HTTPS: Nginx and Let's Encrypt; `www` redirects to the main domain. Certificate renewal uses `certbot.timer`.

Use the live office for new records. The localhost database is a separate development copy and does not synchronize with production. Both the portable desktop configuration and this computer's installed desktop configuration now use the live domain. Reopen any existing desktop window to load it.

The migration preserved existing users and passwords and transferred three member records. The password recorded in LOCAL-ACCESS.txt did not match the source database at deployment time; use the password currently used for the office. No existing account password was reset. Live authentication was independently verified with a temporary account, which was removed afterwards.

## Operation

SSH from this Windows account:

```powershell
ssh.exe -i D:/VWO/data/ssh/vwo-digitalocean -o UserKnownHostsFile=D:/VWO/data/ssh/known_hosts root@161.35.78.110
```

On the server:

```sh
systemctl status vwo nginx
journalctl -u vwo -n 80 --no-pager
systemctl restart vwo
```

The application restarts automatically after failure and starts on server boot. The firewall permits SSH and HTTP/HTTPS; Node listens only on loopback. Source files and private files are not exposed as a static web root. Production M-Pesa remains disabled.

`scripts/provision-server.sh` and `scripts/activate-server.sh` record the initial setup. Activation refuses to overwrite an existing production database. Future releases must update code without replacing live records.

## Next stage

Daily verified server backups and hourly encrypted PC copies are configured; see BACKUPS.md for retention and recovery. Both restore paths were tested on 11 September 2026. Review individual staff access and finish the remaining public-launch checks afterward.

Verification completed: all 22 automated tests; live browser home/gallery/desktop checks; authenticated API access and close-session revocation; installer self-test and HTTPS connection check; successful Certbot renewal dry run.

11 September: admin-only website traffic analytics deployed, using masked network addresses and daily visitor estimates. Location lookup remains unconfigured. Windows backup task execution verified with result 0.

Fundraising projects, paid event requests, shop orders, and approved sponsorship publishing added. Categories remain hidden until content is published. Payments use office instructions/external checkout and manual verification; no gateway activation or sample content was added.
