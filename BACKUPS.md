# Church backups and recovery

## Automatic protection

- Server: `vwo-backup.timer` runs daily at 02:00 Kenya time (23:00 UTC). A missed run is caught up after boot.
- Each consistent SQLite snapshot is copied into an isolated restore-test database. Integrity, foreign keys, table counts, and a rolled-back write are checked before success is reported.
- The job keeps 14 days of its own `church-auto-*.sqlite` snapshots in `/opt/vwo/data/backups`. It does not delete manual backups.
- PC: Windows Task Scheduler task **VWO Encrypted Backups** checks hourly while Peter is signed in and the computer has network access. It catches up with available server snapshots when it next runs.
- PC copies are in `D:\VWO\data\offserver-backups`, encrypted with Windows DPAPI for Peter's Windows account. Retention is 30 days from download, retaining at least the latest copy. SHA-256 and an encryption/decryption round trip verify each new download.
- Admin **Backups & activity** shows the server schedule, latest successful and verified backup, failure/overdue status, and the latest PC receipt. A PC check timestamp is not a guarantee that the PC will stay online. The filename identifies the actual snapshot copied.

The first server and encrypted PC restores were tested successfully on 11 September 2026. Tests used isolated databases; production records were not replaced.

## Important operating limits

The PC task cannot run while the computer is off or Peter is signed out. Keep it online regularly; snapshots older than the server's 14-day retention cannot be collected after a long absence. DPAPI recovery depends on the Windows user profile and its keys. Reinstalling Windows or losing that profile may make these files unrecoverable. These copies are not portable to another account. Cloud storage with a separately protected recovery key remains a future improvement.

## Check or run manually

On this PC, run under Peter's Windows account:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\VWO\scripts\Receive-Backups.ps1
Get-ScheduledTaskInfo -TaskName 'VWO Encrypted Backups'
```

Local `status.json` records the latest success. `last-error.json`, when present, explains the latest failure. No passwords or member details are logged.

On the server:

```sh
systemctl list-timers vwo-backup.timer
systemctl start vwo-backup.service
journalctl -u vwo-backup.service -n 60 --no-pager
```

## Recover safely

1. Choose a known-good snapshot and record its timestamp. Restoring it loses changes made after that timestamp.
2. For an encrypted PC copy, decrypt to a new file in the protected backup directory, under Peter's account:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\VWO\scripts\Decrypt-Backup.ps1 -Backup 'D:\VWO\data\offserver-backups\CHOSEN.sqlite.dpapi' -Output 'D:\VWO\data\offserver-backups\recovered.sqlite'
```

3. Check the decrypted SQLite file's integrity and relevant record counts in an isolated instance before using it. Keep that instance private and payment processing disabled.
4. For a live restore, the server operator should stop `vwo` and pause the backup timer, preserve the current database **and its WAL/SHM files** in a dated recovery directory, then install the verified snapshot as `/opt/vwo/data/church.sqlite` owned by `vwo:vwo` with mode 600. Never replace only the database while the service is running, or leave old WAL/SHM files beside the restored snapshot.
5. Invalidate restored sessions, restart `vwo`, check login and records, re-enable the backup timer, and create a fresh verified backup. Keep the pre-restore files for rollback until recovery is confirmed.
6. Remove temporary decrypted PC copies after verification/recovery. Do not email or publish database files.

The scripts intentionally do not automatically overwrite the production database during recovery.

Windows Task Scheduler execution was verified on 11 September 2026 after tool access resumed: LastTaskResult was 0 (success), and the next hourly run is scheduled.
