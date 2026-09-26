import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '$lib/ui/theme.css';
import { mount } from 'svelte';
import { installAppChrome } from '$lib/ui/chrome';
import App from './App.svelte';

// Plain `vite` in a browser has no Tauri backend: fake one for visual work.
if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
  const { installDevMock } = await import('$lib/dev-mock');
  installDevMock('palette');
}

installAppChrome();

export default mount(App, { target: document.getElementById('app')! });
