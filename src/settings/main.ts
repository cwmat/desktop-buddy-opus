import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '$lib/ui/theme.css';
import { mount } from 'svelte';
import { ipc, loadState } from '$lib/ipc';
import { installAppChrome } from '$lib/ui/chrome';
import App from './App.svelte';

// Plain `vite` in a browser has no Tauri backend: fake one for visual work.
if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
  const { installDevMock } = await import('$lib/dev-mock');
  installDevMock('settings');
}

installAppChrome();

// Load before the first render: rendering defaults first would flash the default buddy and
// slide every toggle to its real value each time the window opens.
let loadError: string | undefined;
const [initial, info] = await Promise.all([
  loadState().catch((err: unknown) => {
    loadError = String(err);
    return null;
  }),
  ipc.appInfo().catch(() => null),
]);

export default mount(App, { target: document.getElementById('app')!, props: { initial, loadError, info } });
