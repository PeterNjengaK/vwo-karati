param([Parameter(Mandatory=$true)][string]$Backup,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
if (Test-Path -LiteralPath $Output) { throw 'Output exists; refusing to overwrite it.' }
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Backup)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes([IO.Path]::GetFullPath($Output),$bytes)
Write-Output 'Backup decrypted. This SQLite file contains private church data; protect it and remove it after recovery.'
