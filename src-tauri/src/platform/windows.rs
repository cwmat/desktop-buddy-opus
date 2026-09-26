//! Win32 implementation. Every call here is a cheap, read-only query (the pet polls
//! them ~2×/s) except `keep_on_top` and `restore_foreground`. All rects are physical
//! pixels: Tauri makes the process per-monitor DPI aware.

use std::{
    ffi::c_void,
    mem::size_of,
    ptr::null_mut,
    sync::atomic::{AtomicPtr, Ordering},
};

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
        WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect,
            GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, SetForegroundWindow,
            SetWindowPos, GWL_EXSTYLE, GWL_STYLE, GW_HWNDPREV, HWND_TOPMOST, SWP_NOACTIVATE,
            SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, WS_CAPTION, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
        },
    },
};

use super::{ForegroundWindow, ScreenRect};

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

/// The taskbars (primary and other monitors): clicking one (e.g. a tray icon) focuses it
/// and raises it over the pet.
const TASKBAR_CLASSES: [&str; 2] = ["Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

/// How far `keep_on_top` walks up the z-order. Only a guard: the z-order can change
/// while we walk it, and the topmost band above the pet is short.
const MAX_Z_WALK: usize = 1024;

/// The last app window seen in front (see [`app_window`]). Our own windows and the shell
/// never replace it, so it still names the window the user was working in while the
/// palette, a menu or the taskbar has the focus.
static LAST_APP_WINDOW: AtomicPtr<c_void> = AtomicPtr::new(null_mut());

/// The last window seen covering its whole monitor (see [`fullscreen_monitor`]).
static LAST_FULLSCREEN: AtomicPtr<c_void> = AtomicPtr::new(null_mut());

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

/// The app window the user is working in, if it's a normal, restored window. While one
/// of our windows or a taskbar is in front, that's still the last app window: opening
/// the palette or the tray menu shouldn't knock a perched pet off.
pub fn foreground_window() -> Option<ForegroundWindow> {
    let hwnd = working_window()?;
    if is_zoomed(hwnd) {
        return None;
    }
    let rect = frame_bounds(hwnd)?;
    let (width, height) = (rect.right - rect.left, rect.bottom - rect.top);
    (width >= MIN_WIDTH && height >= MIN_HEIGHT).then_some(ForegroundWindow {
        id: hwnd as isize as i64,
        rect: ScreenRect {
            x: rect.left,
            y: rect.top,
            width,
            height,
        },
    })
}

/// The monitor showing a fullscreen game, video or presentation, if any, so only the pet
/// on that monitor steps aside. Judged by geometry (an app window covering its whole
/// monitor: exclusive and borderless fullscreen, F11 browsers, slideshows) rather than the
/// shell's notification state, which is system-wide and would hide pets on every monitor.
///
/// A fullscreen window keeps its monitor while the user works on another one (a game stays
/// on screen when you switch to a chat on the second monitor). It's forgotten once another
/// app window comes to the front on that monitor, or it stops covering it.
pub fn fullscreen_monitor() -> Option<ScreenRect> {
    // SAFETY: no preconditions; may return null.
    let foreground = unsafe { GetForegroundWindow() };
    if let Some(monitor) = fullscreen_on(foreground) {
        LAST_FULLSCREEN.store(foreground, Ordering::Relaxed);
        return Some(screen_rect(monitor));
    }
    let last = fullscreen_on(LAST_FULLSCREEN.load(Ordering::Relaxed));
    let covered_by_foreground = |m: &RECT| {
        is_app_window(foreground) && monitor_bounds(foreground).is_some_and(|f| same_rect(&f, m))
    };
    match last {
        Some(monitor) if !covered_by_foreground(&monitor) => Some(screen_rect(monitor)),
        _ => {
            LAST_FULLSCREEN.store(null_mut(), Ordering::Relaxed);
            None
        }
    }
}

/// Puts the pet back above the taskbar after a click on the taskbar raised it over the
/// pet, without moving or activating it. The pet goes directly above the highest
/// taskbar rather than to the very top, so whatever opened above the taskbar since
/// (popup menus, including the tray menu a taskbar click opens, and the palette) stays
/// above the pet. No-op while no taskbar is above it.
pub fn keep_on_top(window: &WebviewWindow) {
    let Ok(pet) = window.hwnd() else {
        return;
    };
    let Some(taskbar) = highest_taskbar_above(pet.0) else {
        return;
    };
    // SAFETY: plain query on a window handle; null when the taskbar is at the very top.
    let above = unsafe { GetWindow(taskbar, GW_HWNDPREV) };
    // Inserting after a topmost window keeps the pet in the topmost band.
    let insert_after = if above.is_null() || ex_style(above) & WS_EX_TOPMOST == 0 {
        HWND_TOPMOST
    } else {
        above
    };
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER;
    // SAFETY: `pet` belongs to a live Tauri window; the flags ignore position and size.
    if unsafe { SetWindowPos(pet.0, insert_after, 0, 0, 0, 0, flags) } == 0 {
        eprintln!("[platform] couldn't raise the pet above the taskbar");
    }
}

/// Gives the foreground back to the last app window if the pet window has it (showing
/// the pet's context menu activates the pet). Best-effort and silent: Windows allows it
/// because our process owns the foreground, and if it refuses nothing changes.
pub fn restore_foreground(pet: &WebviewWindow) {
    let Ok(pet) = pet.hwnd() else {
        return;
    };
    // SAFETY: no preconditions; may return null.
    if unsafe { GetForegroundWindow() } != pet.0 {
        return;
    }
    if let Some(hwnd) = last_app_window() {
        // SAFETY: plain call on a window handle; a stale handle just fails.
        unsafe { SetForegroundWindow(hwnd) };
    }
}

/// The highest taskbar above `hwnd` in the z-order, if any.
fn highest_taskbar_above(hwnd: HWND) -> Option<HWND> {
    let mut highest = None;
    let mut current = hwnd;
    for _ in 0..MAX_Z_WALK {
        // SAFETY: plain query on a window handle; null past the top or for a stale handle.
        current = unsafe { GetWindow(current, GW_HWNDPREV) };
        if current.is_null() {
            break;
        }
        if has_class(current, &TASKBAR_CLASSES) {
            highest = Some(current);
        }
    }
    highest
}

/// The monitor `hwnd` covers entirely, if it's an app window that does.
fn fullscreen_on(hwnd: HWND) -> Option<RECT> {
    if !is_app_window(hwnd) {
        return None;
    }
    monitor_bounds(hwnd).filter(|monitor| covers_monitor(hwnd, monitor))
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

/// The app window the user is working in: the foreground window, or the last app window
/// while ours or a taskbar is in front (or nothing is, mid-switch). The desktop doesn't
/// count: "Show desktop" (Win+D) can put it over app windows without minimizing them,
/// so the last one may not be on screen.
fn working_window() -> Option<HWND> {
    // SAFETY: no preconditions; may return null.
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() || is_own(hwnd) || has_class(hwnd, &TASKBAR_CLASSES) {
        last_app_window()
    } else {
        app_window(hwnd)
    }
}

/// `hwnd` if it's an app window, which then becomes the remembered [`LAST_APP_WINDOW`].
fn app_window(hwnd: HWND) -> Option<HWND> {
    if !is_app_window(hwnd) {
        return None;
    }
    LAST_APP_WINDOW.store(hwnd, Ordering::Relaxed);
    Some(hwnd)
}

/// The last app window seen in front, if it still is an app window on screen.
fn last_app_window() -> Option<HWND> {
    let hwnd = LAST_APP_WINDOW.load(Ordering::Relaxed);
    is_app_window(hwnd).then_some(hwnd)
}

/// A visible, non-minimized window that isn't ours, a tool window, or part of the
/// desktop shell. A null or stale handle isn't one.
fn is_app_window(hwnd: HWND) -> bool {
    if hwnd.is_null() || is_own(hwnd) {
        return false;
    }
    // SAFETY: plain queries on a window handle; a stale handle just yields FALSE.
    let (visible, minimized) = unsafe { (IsWindowVisible(hwnd) != 0, IsIconic(hwnd) != 0) };
    visible
        && !minimized
        && !is_cloaked(hwnd)
        && ex_style(hwnd) & WS_EX_TOOLWINDOW == 0
        && !is_shell(hwnd)
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
    has_class(hwnd, &SHELL_CLASSES)
}

fn has_class(hwnd: HWND, classes: &[&str]) -> bool {
    let mut buf = [0u16; 64];
    // SAFETY: `buf` is writable for the length we pass.
    let len = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if len <= 0 {
        return false;
    }
    let class = String::from_utf16_lossy(&buf[..len as usize]);
    classes.contains(&class.as_str())
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

fn screen_rect(r: RECT) -> ScreenRect {
    ScreenRect {
        x: r.left,
        y: r.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
    }
}

fn same_rect(a: &RECT, b: &RECT) -> bool {
    (a.left, a.top, a.right, a.bottom) == (b.left, b.top, b.right, b.bottom)
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
