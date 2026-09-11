$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe' }
$outputPath = Join-Path $PSScriptRoot 'VWO-Church-Office.exe'
$iconPath = Join-Path $PSScriptRoot 'myicon.ico'
$sourcePath = Join-Path $PSScriptRoot 'DesktopLauncher.cs'
$manifestPath = Join-Path $PSScriptRoot 'app.manifest'
& $compiler /nologo /target:winexe "/out:$outputPath" "/win32icon:$iconPath" "/win32manifest:$manifestPath" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
Write-Host 'Built VWO-Church-Office.exe. Distribute it with desktop-config.json.'
$releasePath = Join-Path $PSScriptRoot 'release'
New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
$setupPath = Join-Path $releasePath 'VWO-Church-Office-Setup.exe'
$installerSource = Join-Path $PSScriptRoot 'Installer.cs'
& $compiler /nologo /target:winexe "/out:$setupPath" "/win32icon:$iconPath" "/win32manifest:$manifestPath" "/resource:$outputPath,launcher" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll $installerSource
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }
Write-Host 'Built release/VWO-Church-Office-Setup.exe.'
$checksum = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $releasePath 'SHA256SUMS.txt') -Value "$checksum  VWO-Church-Office-Setup.exe" -Encoding ASCII
