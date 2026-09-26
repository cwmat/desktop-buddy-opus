<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import { getPet } from '$pets';
  import { onSettingsChanged, onSettingsNavigate, onStats } from '$lib/events';
  import { ipc, loadState, updateSettings } from '$lib/ipc';
  import { DEFAULT_SETTINGS, SECTIONS, type Platform, type SettingSection, type Settings } from '$lib/settings';
  import type { StatsMap } from '$lib/stats';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { applyAccent, applyTheme } from '$lib/ui/theme';
  import BuddyGallery from './BuddyGallery.svelte';
  import SettingsList from './SettingsList.svelte';
  import Sidebar from './Sidebar.svelte';
  import { searchRows, sectionRows } from './rows';
  import type { UpdateOptions } from './types';

  const isSection = (value: unknown): value is SettingSection => SECTIONS.some((s) => s.id === value);

  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let stats = $state<StatsMap>({});
  let platform = $state<Platform>(navigator.userAgent.includes('Mac') ? 'macos' : 'windows');
  let version = $state('');
  let section = $state<SettingSection>(
    ((s) => (isSection(s) ? s : 'buddy'))(new URLSearchParams(location.search).get('section')),
  );
  let query = $state('');
  let toast = $state<string | null>(null);

  let sidebar: Sidebar;
  let main: HTMLElement;
  let results = $state<HTMLElement>();

  const pet = $derived(getPet(settings.petId));
  const current = $derived(SECTIONS.find((s) => s.id === section)!);
  const searching = $derived(query.trim().length > 0);
  const rows = $derived(searching ? searchRows(query, platform) : sectionRows(section, platform));

  $effect(() => applyTheme(settings.theme));
  $effect(() => applyAccent(pet.accent));
  $effect(() => {
    // Match the native title bar to the chosen theme (null = follow the OS).
    getCurrentWindow()
      .setTheme(settings.theme === 'system' ? null : settings.theme)
      .catch(() => {});
  });

  // ---------------------------------------------------------------------------
  // Settings writes: optimistic, then reconciled with what Rust actually stored.
  // While writes are in flight we ignore change broadcasts, which may be stale
  // (e.g. dragging a slider emits several writes in a row).
  // ---------------------------------------------------------------------------
  let inFlight = 0;

  async function update(patch: Partial<Settings>, { inlineError = false }: UpdateOptions = {}) {
    const before = settings;
    settings = { ...settings, ...patch };
    inFlight++;
    try {
      const stored = await updateSettings(patch);
      if (inFlight === 1) settings = stored;
      return null;
    } catch (err) {
      // Roll back only the keys we touched; other changes may have landed meanwhile.
      const rollback = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof Settings]]));
      settings = { ...settings, ...rollback };
      const message = String(err ?? 'Something went wrong.');
      if (!inlineError) showToast(message);
      return message;
    } finally {
      inFlight--;
    }
  }

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(message: string) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 5000);
  }

  function navigate(next: SettingSection) {
    section = next;
    query = '';
    main?.scrollTo({ top: 0 });
  }

  async function focusFirstResult() {
    await tick();
    results?.querySelector<HTMLElement>('button:not([tabindex="-1"]), input')?.focus();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'k' || e.key === 'f')) {
      e.preventDefault();
      sidebar.focusSearch();
    } else if (e.key === 'Escape' && query && !e.defaultPrevented) {
      query = '';
    }
  }

  onMount(() => {
    const listeners: Promise<UnlistenFn>[] = [
      onSettingsChanged((next) => {
        if (inFlight === 0) settings = next;
      }),
      onStats((next) => (stats = next)),
      onSettingsNavigate(navigate),
    ];

    loadState()
      .then((state) => {
        if (inFlight === 0) settings = state.settings;
        stats = state.stats;
      })
      .catch((err) => showToast(`Couldn’t load your settings: ${err}`));
    ipc
      .appInfo()
      .then((info) => {
        platform = info.platform;
        version = info.version;
      })
      .catch(() => {});

    return () => {
      clearTimeout(toastTimer);
      listeners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="app">
  <Sidebar
    bind:this={sidebar}
    bind:query
    {pet}
    {section}
    {platform}
    {version}
    onnavigate={navigate}
    onsearchenter={focusFirstResult}
  />

  <main bind:this={main}>
    <div class="content">
      {#if searching}
        <header>
          <h1 class="pixel">Search</h1>
          <p>
            {rows.length === 0 ? 'No matches for' : `${rows.length} ${rows.length === 1 ? 'match' : 'matches'} for`}
            “{query.trim()}”
          </p>
        </header>
        <div bind:this={results}>
          {#if rows.length}
            <SettingsList matches={rows} {settings} {platform} showSection onupdate={update} onnavigate={navigate} />
          {:else}
            <div class="empty">
              <Sprite {pet} animation="sleep" scale={2} />
              <p>{pet.name} looked everywhere. Try another word, or press <kbd class="kbd">Esc</kbd> to clear.</p>
            </div>
          {/if}
        </div>
      {:else}
        <header>
          <h1 class="pixel">{current.label}</h1>
          <p>{current.blurb}</p>
        </header>
        {#if section === 'buddy'}
          <BuddyGallery {settings} {stats} {platform} onselect={(petId) => update({ petId })} />
        {/if}
        {#if rows.length}
          <SettingsList matches={rows} {settings} {platform} onupdate={update} onnavigate={navigate} />
        {/if}
      {/if}
    </div>
  </main>
</div>

{#if toast}
  <div class="toast" role="alert">
    <span>{toast}</span>
    <button type="button" aria-label="Dismiss" onclick={() => (toast = null)}>✕</button>
  </div>
{/if}

<style>
  :global(body) {
    background: var(--bg);
    overflow: hidden;
  }
  .app {
    display: flex;
    height: 100vh;
  }
  main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 880px;
    margin: 0 auto;
    padding: var(--space-5) var(--space-6) var(--space-7);
  }
  header {
    margin-bottom: var(--space-1);
  }
  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    line-height: 1.15;
  }
  header p {
    margin: 4px 0 0;
    color: var(--text-2);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-7) var(--space-4);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--text-2);
    text-align: center;
  }
  .empty p {
    margin: 0;
  }

  .toast {
    position: fixed;
    bottom: var(--space-4);
    left: 50%;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: min(520px, calc(100vw - 32px));
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border));
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    color: var(--text);
    font-size: 13px;
    translate: -50% 0;
    animation: rise var(--dur) var(--ease);
  }
  .toast::before {
    content: '';
    flex: none;
    width: 8px;
    height: 8px;
    background: var(--danger);
  }
  .toast button {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-3);
  }
  .toast button:hover {
    background: var(--hover);
    color: var(--text);
  }
  @keyframes rise {
    from {
      opacity: 0;
      translate: -50% 8px;
    }
  }

  @media (max-width: 720px) {
    .content {
      padding: var(--space-4);
    }
  }
</style>
