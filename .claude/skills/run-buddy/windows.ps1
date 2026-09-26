# Lists Desktop Buddy's titled top-level windows with physical bounds.
# Dot-source it (`. windows.ps1 -Quiet`) to get the Get-BuddyWindows function without output.
param([switch]$Quiet)

Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class BuddyWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
  public static List<object[]> List(uint pid) {
    var o = new List<object[]>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (p == pid && sb.Length > 0) { RECT r; GetWindowRect(h, out r); o.Add(new object[] { sb.ToString(), IsWindowVisible(h), r.L, r.T, r.R - r.L, r.B - r.T }); }
      return true;
    }, IntPtr.Zero);
    return o;
  }
}
"@
[BuddyWin]::SetProcessDPIAware() | Out-Null

function Get-BuddyWindows {
  $proc = Get-Process desktop-buddy -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $proc) { throw 'Desktop Buddy is not running.' }
  [BuddyWin]::List($proc.Id) | ForEach-Object {
    [pscustomobject]@{ Title = $_[0]; Visible = $_[1]; X = $_[2]; Y = $_[3]; Width = $_[4]; Height = $_[5] }
  }
}

if (-not $Quiet) { Get-BuddyWindows | Format-Table -AutoSize }
