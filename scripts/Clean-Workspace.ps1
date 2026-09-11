# Remove reproducible development output only. Never touches live data or releases.
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$workspacePrefix = $workspacePath + '\'
$removedBytes = 0L
foreach ($relative in @('.npm-cache', 'test-results')) {
    $target = [IO.Path]::GetFullPath((Join-Path $workspacePath $relative))
    if (!$target.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Outside workspace: $target" }
    if (!(Test-Path -LiteralPath $target)) { continue }
    $items = @(Get-Item -LiteralPath $target -Force) + @(Get-ChildItem -LiteralPath $target -Recurse -Force)
    if ($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw "Refusing to traverse links in $relative" }
    $removedBytes += ($items | Where-Object { !$_.PSIsContainer } | Measure-Object Length -Sum).Sum
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Output "Removed $relative"
}
Write-Output ('Freed {0:N1} MB of generated output.' -f ($removedBytes / 1MB))
