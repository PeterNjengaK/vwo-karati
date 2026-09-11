$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$root = 'D:\VWO\data\offserver-backups'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$lock = [System.Threading.Mutex]::new($false,'Local\VWOChurchBackupReceive')
if (!$lock.WaitOne(0)) { exit 0 }
$sshOptions = @('-i','D:/VWO/data/ssh/vwo-digitalocean','-o','BatchMode=yes','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=D:/VWO/data/ssh/known_hosts')
$temporary = Join-Path $root 'download.partial'
try {
    $names = & ssh.exe @sshOptions root@161.35.78.110 'ls -1 /opt/vwo/data/backups/church-auto-*.sqlite'
    if ($LASTEXITCODE -ne 0) { throw 'Could not connect to the backup server.' }
    foreach ($remoteName in $names) {
        $name = ($remoteName -split '/')[-1].Trim()
        if ($name -notmatch '^church-auto-[\dTZ-]+\.sqlite$') { continue }
        $target = Join-Path $root ($name + '.dpapi')
        if (Test-Path -LiteralPath $target) { continue }
        & scp.exe @sshOptions "root@161.35.78.110:/opt/vwo/data/backups/$name" $temporary
        if ($LASTEXITCODE -ne 0) { throw 'Backup download failed.' }
        $remoteHash = & ssh.exe @sshOptions root@161.35.78.110 "sha256sum /opt/vwo/data/backups/$name"
        if ($LASTEXITCODE -ne 0 -or !$remoteHash) { throw 'Could not verify backup checksum.' }
        $expected = ($remoteHash -split '\s+')[0]
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Downloaded backup checksum mismatch.' }
        $plain = [IO.File]::ReadAllBytes($temporary)
        $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes($target+'.partial',$encrypted)
        $verified = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($target+'.partial'),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $sha = [Security.Cryptography.SHA256]::Create()
        $actual = ([BitConverter]::ToString($sha.ComputeHash($verified))).Replace('-','').ToLowerInvariant()
        $sha.Dispose()
        if ($actual -ne $expected) { throw 'Encrypted backup recovery check failed.' }
        Move-Item -LiteralPath ($target+'.partial') -Destination $target
        Remove-Item -LiteralPath $temporary
    }
    $copies = @(Get-ChildItem -LiteralPath $root -Filter '*.sqlite.dpapi' | Sort-Object Name)
    if (!$copies.Count) { throw 'No verified off-server copies found.' }
    foreach ($file in $copies) {
        if ($file.Name -match '^church-auto-[\dTZ-]+\.sqlite\.dpapi$' -and $file.LastWriteTime -lt (Get-Date).AddDays(-30) -and $file.FullName -ne $copies[-1].FullName) { Remove-Item -LiteralPath $file.FullName }
    }
    @{last_success=(Get-Date).ToUniversalTime().ToString('o');latest=$copies[-1].Name;encrypted=$true;error=$null} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'status.json') -Encoding UTF8
    & scp.exe @sshOptions (Join-Path $root 'status.json') root@161.35.78.110:/opt/vwo/data/backups/offserver-status.json
    if ($LASTEXITCODE -ne 0) { throw 'Backup saved locally but server receipt could not be updated.' }
    & ssh.exe @sshOptions root@161.35.78.110 'chown vwo:vwo /opt/vwo/data/backups/offserver-status.json; chmod 600 /opt/vwo/data/backups/offserver-status.json'
    if ($LASTEXITCODE -ne 0) { throw 'Could not set backup receipt permissions.' }
    if (Test-Path -LiteralPath (Join-Path $root 'last-error.json')) { Remove-Item -LiteralPath (Join-Path $root 'last-error.json') }
    Write-Output 'Encrypted off-server backups downloaded and recovery checks passed.'
} catch {
    @{last_attempt=(Get-Date).ToUniversalTime().ToString('o');error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'last-error.json') -Encoding UTF8
    throw
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    $lock.ReleaseMutex();$lock.Dispose()
}
