/** Applies the user's theme choice and the active buddy's accent to the document. */
import type { Theme } from '$lib/settings';
import { accentShades } from './color';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // No attribute = follow prefers-color-scheme (see theme.css).
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
}

export function applyAccent(accent: string): void {
  const { base, light, dark } = accentShades(accent);
  const style = document.documentElement.style;
  style.setProperty('--accent', base);
  style.setProperty('--accent-on-light', light);
  style.setProperty('--accent-on-dark', dark);
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
