Set-Location "C:/Users/29014/Documents/Makuku_new"
$lines = Get-Content '.env.local'
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    $name = $matches[1]
    $value = $matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}
node scripts/backfill-store-visit-thumbnails.mjs --apply
