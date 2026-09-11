# Hosting and M-Pesa activation

## Architecture

```text
Public website ──┐
Browser office ─┼── HTTPS server (Node.js) ── private SQLite database
Windows office ─┘              │
                               └── Safaricom Daraja API
```

The database lives on one persistent server. Remote computers communicate with the server over HTTPS; they never open the database file. This deployment supports one Node process and a local persistent disk. Do not put the SQLite file on a network share, ephemeral serverless filesystem, or multiple independent application replicas. Large-scale deployments should introduce a managed database and migrate the repository layer.

## Deploy

1. Choose a server/domain and install Node.js 24.14+. Upload `server/`, `web/`, `Website/images/`, and `package.json` plus your protected database if migrating this installation. To offer the Windows installer from the office, also upload only `ChurchRegister/release/VWO-Church-Office-Setup.exe`. Exclude legacy registration files, test outputs, local access notes, and old executables from public hosting.
2. Set `.env` using `.env.example`: `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-church-domain`, `HOST=127.0.0.1`, `PORT=3000`, and a private persistent `DATABASE_PATH`. No trailing slash in the origin. Limit OS access to the environment file, database, and backups to the service operator.
3. Use a service manager to run `node --env-file=.env server/index.mjs` in the application directory and restart it after failures.
4. Terminate HTTPS at a reverse proxy on the same machine. Proxy the entire origin to `127.0.0.1:3000`; do not use the repository as a static directory. Set an 8 MB body limit, 60-second upstream timeout, and overwrite `X-Real-IP` with the connecting client's address. Enable `TRUST_LOCAL_PROXY=true` only for this local proxy arrangement. The application trusts this header only from loopback peers, so untrusted clients cannot choose their rate-limit identity. Other proxy arrangements require an explicit trusted-proxy implementation.
5. Create an administrator with `npm run setup` if needed. Confirm anonymous access cannot read member/inbox/account/payment routes. Update actual service times and church contact details in Settings; the initial service-time text intentionally does not invent a schedule.
6. Point each desktop client's `desktop-config.json` to the same HTTPS origin. Keep the desktop launcher and config together. The executable is unsigned; sign a release with the church/operator's code-signing certificate before broad distribution.
7. Schedule `npm run backup` daily, copy encrypted backups off-server, and test a restore to a separate instance. Set a retention policy for member records, messages, logs, images, and backups with the church office.

The privacy page describes implemented data flows. The church should review it and approve data retention and photo permissions before public launch.

## M-Pesa

The integration is built against the [Safaricom Daraja developer platform](https://developer.safaricom.co.ke/apis). Actual sandbox and production transactions require a Daraja application, credentials, approved shortcode/paybill or till configuration, passkey, and a public HTTPS callback URL. They have not been exercised without church credentials.

In the server environment, set:

```dotenv
MPESA_MODE=sandbox
MPESA_CONSUMER_KEY=your-key
MPESA_CONSUMER_SECRET=your-secret
MPESA_SHORTCODE=your-shortcode
MPESA_PASSKEY=your-passkey
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline
MPESA_CALLBACK_SECRET=a-cryptographically-random-secret-at-least-32-characters
PUBLIC_ORIGIN=https://your-church-domain
```

The callback URL is `PUBLIC_ORIGIN/api/mpesa/callback/MPESA_CALLBACK_SECRET`. Never put secrets in browser files or desktop config. Suppress or redact callback paths in reverse-proxy access logs because the URL includes the callback secret. Confirm the appropriate transaction type and shortcode configuration with Safaricom before accepting real payments.

The backend requests an OAuth token, sends an STK push, and stores the checkout identifier. A successful initial response means **pending**, not paid. A callback only triggers an authenticated Daraja status query; supplied callback fields do not independently establish payment success. The server also queries pending requests every 30 seconds for the first 24 hours. Staff can request another check from Giving. Only a successful authenticated query marks a gift paid. Receipt strings from callbacks are not treated as verified accounting receipts; use the Safaricom statement for accounting reconciliation.

If initiation times out before a checkout identifier is returned, the request is kept **unknown**, and the visitor is told to contact the office before retrying. Such payments require checking the Safaricom account directly because the application has no checkout ID to query. Do not assume a timeout means the phone was not charged. The payment screen keeps a reference in the browser tab and never automatically starts a second gift. Staff should investigate pending/unknown gifts and compare against the Safaricom statement.

Validate with Safaricom sandbox: success, cancellation, wrong PIN, phone timeout, delayed/missing callbacks, repeated requests, and interrupted connectivity. Reconcile pending sandbox records before switching to production credentials. The server will not reconcile a record against a different environment. Set `MPESA_MODE=production` only after production approval and a controlled end-to-end check. Sandbox payments remain visibly labelled and excluded from production totals.

## Current operating limits

- The live system is deployed at https://vwokarati.com on DigitalOcean. See LIVE-SERVER.md for operations. Daraja and external email delivery remain unconfigured.
- Website messages are saved in the office inbox. “Reply by email” opens the staff email application; the server does not send mail or automated notifications.
- Staff can create, disable, and change account roles. Each person can change their own password. For a lost administrator password, use the server-side recovery command described below; there is no unauthenticated web reset route.
- Staff sessions expire after 30 minutes. Records are hidden when the browser detects offline status or a periodic session check fails. The application provides no offline editing or service-worker cache.
- The 1.1 database additions are created automatically on startup. Take a backup first. Attendance and care tasks share the existing database and are included in backups. See FEATURES.md for access rules and reporting definitions.
- CSV exports work in Excel. PDF output can use browser printing; legacy PDF/XLSX layouts are not reproduced.
- Content supports direct JPEG/PNG/WebP uploads up to 5 MB, existing local church photos, and HTTPS image URLs. Member photographs can be uploaded directly, up to 500 KB. Content dates are entered as Kenya time; the ministry office should confirm event schedules before publishing.

## Account recovery

From the server terminal, run `node --env-file-if-exists=.env server/reset-password.mjs`. This updates an existing account password and invalidates all its sessions. Use only as the authorised server operator. The typed password is visible in this terminal; environment variables `RESET_EMAIL` and `RESET_PASSWORD` are also supported for secret-aware administration.

## References

- [Node SQLite documentation](https://nodejs.org/api/sqlite.html)
- The maintained Windows client is the native launcher in ChurchRegister/DesktopLauncher.cs.
