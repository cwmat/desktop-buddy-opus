//! Win32 implementation. Every call here is a cheap, read-only query (the pet polls
//! them ~2×/s) except `keep_on_top`. All rects are physical pixels: Tauri makes the
//! process per-monitor DPI aware.

use std::{ffi::c_void, mem::size_of};

use tauri::WebviewWindow;
use windows_sys::Win32::{
    Foundation::{HWND, RECT},
    Graphics::{
        Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS},
        Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONULL},
    },
    System::SystemInformation::GetTickCount,
    UI::{
        Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
        Shell::{
            SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
            QUNS_RUNNING_D3D_FULL_SCREEN,
        },
        WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetWindowLongW, GetWindowRect,
            GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, SetWindowPos,
            GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
            SWP_NOSIZE, WS_CAPTION, WS_EX_TOOLWINDOW,
        },
    },
};

use super::ScreenRect;

/// Foreground windows smaller than this (tooltips, toasts, tiny dialogs) aren't reported.
const MIN_WIDTH: i32 = 160;
const MIN_HEIGHT: i32 = 80;

/// The desktop and taskbar: never something the pet should perch on or treat as fullscreen.
const SHELL_CLASSES: [&str; 4] = [
    "Progman",
    "WorkerW",
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
];

pub fn idle_seconds() -> Option<f64> {
    let mut info = LASTINPUTINFO {
        cbSize: size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `info` is a valid LASTINPUTINFO with `cbSize` set, as the API requires.
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return None;
    }
    // SAFETY: no preconditions.
    let now = unsafe { GetTickCount() };
    // Both are 32-bit tick counts that wrap every ~49.7 days; wrapping_sub stays correct.
    Some(f64::from(now.wrapping_sub(info.dwTime)) / 1000.0)
}

/// Bounds of the app window the user is working in, if it's a normal, restored window.
pub fn foreground_window() -> Option<ScreenRect> {
    let hwnd = foreign_foreground()?;
    if is_zoomed(hwnd) {
        return None;
    }
    let rect = frame_bounds(hwnd)?;
    let (width, height) = (rect.right - rect.left, rect.bottom - rect.top);
    (width >= MIN_WIDTH && height >= MIN_HEIGHT).then_some(ScreenRect {
        x: rect.left,
        y: rect.top,
        width,
        height,
    })
}

/// The monitor where a game, video or presentation is fullscreen, if any. Only the pet
/// on that monitor needs to step aside. The monitor-coverage check catches
/// borderless-fullscreen games and F11 browsers; the shell's notification state catches
/// exclusive fullscreen and presentation mode.
pub fn fullscreen_monitor() -> Option<ScreenRect> {
    let hwnd = foreign_foreground()?;
    let monitor = monitor_bounds(hwnd)?;
    (covers_monitor(hwnd, &monitor) || shell_reports_busy()).then(|| ScreenRect {
        x: monitor.left,
        y: monitor.top,
        width: monitor.right - monitor.left,
        height: monitor.bottom - monitor.top,
    })
}

/// Pushes the window back to the top of the topmost band without moving or activating it.
pub fn keep_on_top(window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER;
    // SAFETY: `hwnd` belongs to a live Tauri window; the flags ignore position and size.
    if unsafe { SetWindowPos(hwnd.0, HWND_TOPMOST, 0, 0, 0, 0, flags) } == 0 {
        eprintln!("[platform] SetWindowPos(HWND_TOPMOST) failed");
    }
}

fn shell_reports_busy() -> bool {
    let mut state = 0;
    // SAFETY: `state` is a valid out pointer for the duration of the call.
    let hr = unsafe { SHQueryUserNotificationState(&mut state) };
    hr >= 0
        && matches!(
            state,
            QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE
        )
}

fn covers_monitor(hwnd: HWND, monitor: &RECT) -> bool {
    // With an auto-hiding taskbar a plain maximized window fills the monitor too.
    if is_zoomed(hwnd) && style(hwnd) & WS_CAPTION == WS_CAPTION {
        return false;
    }
    let Some(window) = frame_bounds(hwnd) else {
        return false;
    };
    window.left <= monitor.left
        && window.top <= monitor.top
        && window.right >= monitor.right
        && window.bottom >= monitor.bottom
}

/// The foreground window, if it's a visible, non-minimized app window that isn't ours,
/// a tool window, or part of the desktop shell.
fn foreign_foreground() -> Option<HWND> {
    // SAFETY: no preconditions; may return null.
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() || is_own(hwnd) {
        return None;
    }
    // SAFETY: plain queries on a window handle; a stale handle just yields FALSE.
    let (visible, minimized) = unsafe { (IsWindowVisible(hwnd) != 0, IsIconic(hwnd) != 0) };
    if !visible
        || minimized
        || is_cloaked(hwnd)
        || ex_style(hwnd) & WS_EX_TOOLWINDOW != 0
        || is_shell(hwnd)
    {
        return None;
    }
    Some(hwnd)
}

/// Any window of this process (pet, palette, settings, menus) counts as ours.
fn is_own(hwnd: HWND) -> bool {
    let mut pid = 0;
    // SAFETY: `pid` is a valid out pointer; a stale handle leaves it at 0.
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    pid == std::process::id()
}

fn is_zoomed(hwnd: HWND) -> bool {
    // SAFETY: plain query on a window handle.
    unsafe { IsZoomed(hwnd) != 0 }
}

fn style(hwnd: HWND) -> u32 {
    // SAFETY: plain query on a window handle; the i32 → u32 cast reinterprets style bits.
    unsafe { GetWindowLongW(hwnd, GWL_STYLE) as u32 }
}

fn ex_style(hwnd: HWND) -> u32 {
    // SAFETY: as above.
    unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 }
}

/// Windows on another virtual desktop, or suspended UWP frames, are "cloaked":
/// visible as far as Win32 is concerned but not actually on screen.
fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    // SAFETY: DWMWA_CLOAKED writes a DWORD; we pass a u32 and its exact size.
    let hr = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED as u32,
            (&mut cloaked as *mut u32).cast::<c_void>(),
            size_of::<u32>() as u32,
        )
    };
    hr >= 0 && cloaked != 0
}

fn is_shell(hwnd: HWND) -> bool {
    let mut buf = [0u16; 64];
    // SAFETY: `buf` is writable for the length we pass.
    let len = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if len <= 0 {
        return false;
    }
    let class = String::from_utf16_lossy(&buf[..len as usize]);
    SHELL_CLASSES.contains(&class.as_str())
}

/// Visible bounds: DWM's extended frame excludes the invisible resize borders that
/// `GetWindowRect` includes on Windows 10/11.
fn frame_bounds(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    // SAFETY: DWMWA_EXTENDED_FRAME_BOUNDS writes a RECT; we pass one and its exact size.
    let hr = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            (&mut rect as *mut RECT).cast::<c_void>(),
            size_of::<RECT>() as u32,
        )
    };
    if hr >= 0 {
        return Some(rect);
    }
    // SAFETY: `rect` is a valid out pointer.
    (unsafe { GetWindowRect(hwnd, &mut rect) } != 0).then_some(rect)
}

fn monitor_bounds(hwnd: HWND) -> Option<RECT> {
    // SAFETY: plain query; returns null if the window isn't on any monitor.
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL) };
    if monitor.is_null() {
        return None;
    }
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    // SAFETY: `info` is a MONITORINFO with `cbSize` set, as the API requires.
    (unsafe { GetMonitorInfoW(monitor, &mut info) } != 0).then_some(info.rcMonitor)
}
