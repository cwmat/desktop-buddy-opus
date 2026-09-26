# Per-process CPU and memory of Desktop Buddy (the app + its WebView2 processes) over N seconds.
param([int]$Seconds = 10, [string]$Name = 'desktop-buddy')
$app = Get-Process $Name | Select-Object -First 1
$all = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' }
$ids = @($app.Id); $changed = $true
while ($changed) { $changed = $false; foreach ($k in $all) { if ($ids -contains $k.ParentProcessId -and -not ($ids -contains $k.ProcessId)) { $ids += $k.ProcessId; $changed = $true } } }
$t0 = @{}; foreach ($id in $ids) { $t0[$id] = (Get-Process -Id $id).TotalProcessorTime.TotalMilliseconds }
Start-Sleep -Seconds $Seconds
$sum = 0; $mem = 0
foreach ($id in $ids) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue; if (-not $p) { continue }
  $cmd = ($all | Where-Object ProcessId -eq $id).CommandLine
  $type = if ($cmd -match '--type=([\w-]+)') { $Matches[1] } elseif ($id -eq $app.Id) { 'APP (rust)' } else { 'browser' }
  $ms = [int]($p.TotalProcessorTime.TotalMilliseconds - $t0[$id]); $sum += $ms; $mem += $p.WorkingSet64
  "{0,-16} {1,6} ms  {2,5:N0} MB" -f $type, $ms, ($p.WorkingSet64 / 1MB)
}
"TOTAL: {0:N2}% of one core over {1}s, {2:N0} MB working set" -f ($sum / ($Seconds * 10)), $Seconds, ($mem / 1MB)
