# Screenshots one Desktop Buddy window, or an explicit rectangle (physical px).
#   shot.ps1 -Window pet|settings|palette [-Pad 40] [-Out shot.png]
#   shot.ps1 -X 0 -Y 0 -W 400 -H 300
param(
  [ValidateSet('pet', 'settings', 'palette')][string]$Window,
  [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Pad = 0,
  [string]$Out = (Join-Path (Get-Location) 'shot.png')
)
. (Join-Path $PSScriptRoot 'windows.ps1') -Quiet
Add-Type -AssemblyName System.Drawing

if ($Window) {
  $title = @{ pet = 'Desktop Buddy'; settings = 'Desktop Buddy Settings'; palette = 'Desktop Buddy Command Palette' }[$Window]
  $win = Get-BuddyWindows | Where-Object { $_.Title -eq $title } | Select-Object -First 1
  if (-not $win) { throw "Window '$Window' ($title) not found" }
  if (-not $win.Visible) { Write-Warning "Window '$Window' is hidden; capturing its last bounds anyway." }
  $X = $win.X; $Y = $win.Y; $W = $win.Width; $H = $win.Height
}
if ($W -le 0 -or $H -le 0) { throw 'Nothing to capture: pass -Window or -X/-Y/-W/-H' }
$X -= $Pad; $Y -= $Pad; $W += 2 * $Pad; $H += 2 * $Pad

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size $W, $H))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
"captured $X,$Y ${W}x$H -> $Out"
