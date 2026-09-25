# VWO Karati church system

A responsive church website, a shared church office portal, and a Windows desktop launcher. Both the browser and desktop portal use the same server and database. The desktop client has no separate member database and needs a live connection to sign in and work.

**Version 1.1:** attendance check-in, private member-care tasks, date-range reports, birthday reminders, richer member profiles, profile printing, administrator backup downloads, an activity log, public event calendar downloads, a Windows setup wizard, and browser app installation. See [FEATURES.md](FEATURES.md) for the complete user guide and platform details.

## Start on this computer

Requires Node.js 24.14 or newer. The server has no third-party runtime dependencies.

1. Double-click **Start Website.cmd** in this folder, or run `npm.cmd start` from `D:\VWO`.
2. Open **http://localhost:3000** for the public website.
3. Open **http://localhost:3000/admin** for the church office.
4. Open **ChurchRegister\VWO-Church-Office.exe** for the portable desktop app, or use the installed Start-menu shortcut. Keep `desktop-config.json` beside the portable executable.

If local setup has already been performed, administrator access is in `data/LOCAL-ACCESS.txt`. Change that password under **My account** after signing in, then remove the access file. It is never served by the website.

On a fresh installation, copy `.env.example` to `.env` and run `npm.cmd run setup` to create an administrator. There is no default or public administrator password. The interactive setup password is visible while typing; on a managed server you can instead supply `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` through a secret-aware environment.

## What is included

- Public home, church story, ministries, events, sermons, gallery, visit/contact/prayer forms, giving page, and privacy information.
- Administrator dashboard, member registration/editing/deletion, photographs, search and status filtering, CSV export for Excel, legacy JSON import, website publishing, private inbox, staff accounts, church settings, and password changes.
- Registrars can read, create, edit, and export member records. Only administrators can delete records, import batches, read prayer requests and giving, or manage the website and staff.
- Existing registration fields are retained. **Marital status** (Single/Married/Divorced in the old app) is separate from **membership status** (Active/Inactive/Visitor).
- Password hashing, expiring HTTP-only sessions, CSRF and origin checks, validation, audit events, login throttling, and version checks to prevent silent concurrent overwrites.
- M-Pesa STK push adapter, payment state tracking, idempotent requests, callback handling, and authenticated reconciliation. Giving is disabled until configured. Test payments never count towards production giving totals.

## Existing files and member migration

The server serves the current pages from `web/`, reusing photos from `Website/images/`. Original HTML pages and retired Python clients have been archived under `data/archive/`. Do not deploy the workspace itself as a static web root: it contains private records and database files.

The legacy archive preserves the previous source (with its embedded email password removed), original member JSON files, member photographs, and historical backups. Obsolete executables, build intermediates, and unused legacy credentials were removed. The native Windows launcher and installer are the maintained desktop clients. Existing live records and database backups remain in `data/`.

For a future legacy import, place a `members.json` file and its neighbouring `member_photos/` folder in a private import directory. If recovering archived originals, extract the legacy archive to a private directory first. Preview a migration, including photographs:

```powershell
node --env-file-if-exists=.env server/import.mjs data/import/members.json
```

Apply after the preview succeeds:

```powershell
node --env-file-if-exists=.env server/import.mjs data/import/members.json --apply
```

The importer validates the entire batch, preserves marital status, imports images from the neighbouring `member_photos` folder, and skips matching name-and-phone pairs. It never edits the source files. Web imports accept up to 2,000 records / 8 MB per batch; local photo paths need the migration command or subsequent photo uploads.

## Desktop distribution

For regular Windows installation, distribute **ChurchRegister/release/VWO-Church-Office-Setup.exe**. It asks for the server origin, installs for the current Windows account, adds shortcuts and connection settings, and registers an uninstall entry. You can also download it through **Install desktop app** in the office. Use the hosted HTTPS origin on remote computers; `localhost` always refers to the computer where the app is running.

For compatible macOS/Linux browsers, the office is installable as a web app. Browser installation was checked in Edge; native macOS/Linux packages are not included. See [FEATURES.md](FEATURES.md#desktop-installation).

The built Windows launcher uses installed Microsoft Edge to open the hosted office in its own application window. It checks the server before opening and uses an InPrivate session. This is a Windows launcher for the online portal, not a local copy of its interface or records.

Set `server_url` in `ChurchRegister/desktop-config.json` to the hosted HTTPS origin, then distribute this file with `VWO-Church-Office.exe`. `localhost` is only for development on the server computer. Do not distribute the old `dist/` folder or private database files.

Rebuild with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ChurchRegister/Build-Desktop.ps1
```

Retired Python/pywebview clients and PyInstaller specifications are preserved only in the legacy archive. Python is not required to build or run the maintained Windows client.

## Backups and checks

```powershell
npm.cmd run backup
npm.cmd install
npm.cmd test
```

Backups use SQLite's consistent online backup API and include member photos, content, accounts, messages, and payment records. Protect backups and keep an encrypted copy off the server. To restore, stop the server, preserve the current database plus any `-wal`/`-shm` files, replace the database with a verified backup, remove only the old database's companion WAL/SHM files, and restart. Validate restore procedures on a separate copy before relying on them.

Tests use isolated databases and synthetic people. Browser tests use installed Edge on Windows; `BROWSER_PATH` can select another Chromium executable. On Linux, run `npx playwright install chromium` first. Browser screenshots are saved under `test-results/`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting, server configuration, M-Pesa activation, and operating limits.

## Workspace layout and cleanup

- `web/`: current website and staff interface.
- `Website/images/`: active church photographs and logo.
- `server/`: shared backend, migration, and backup commands.
- `ChurchRegister/`: maintained Windows source, portable launcher, config, and `release/` installer.
- `data/`: private database, backups, local access details, and legacy archive. Never publish this directory.
- `tests/`: automated verification; `node_modules/` contains its installed dependencies.

After running tests, remove generated browser profiles, screenshots, test databases, and the local npm download cache with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Clean-Workspace.ps1
```

This cleanup command does not remove the live database, backups, installed dependencies, desktop builds, or installer.


## Publishing videos and visitor information

Open **Website content > Add media / sermon** in the church office. Add a title and video links, then optionally set preacher, Bible passage, topic, series, category, service/stream date (Kenya time), upload date, and a thumbnail. Select **Publish on the website** to include it in `/watch`, and **Feature on the homepage** for priority placement. Several platform links can belong to the same entry. Keep a draft by leaving publication unchecked.

Visitors can search and filter `/watch`, share message links, and choose an embedded player or open the original video. Automatic channel imports are not configured; add video links manually. Mark a broadcast **Live now** only while it is live, then change its category to **Livestream recording**.

Gallery entries have an album field. Ministry entries have meeting and leader fields. **Church settings** contains service times, church history, first-visit guidance, transport/parking, and children/family information. Use the church leader entry's description and additional details for a biography.
