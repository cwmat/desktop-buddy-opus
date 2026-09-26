/**
 * Desktop-app niceties for our webviews: no browser context menu or reload shortcuts
 * in production builds (they'd expose "Reload"/"Inspect" and reset window state).
 */
export function installAppChrome(): void {
  if (import.meta.env.DEV) return;
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('input, textarea')) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    const reload = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r');
    const print = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p';
    if (reload || print) e.preventDefault();
  });
}
