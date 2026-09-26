<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getPet } from '$pets';
  import { buildCommands, searchCommands, type Command } from '$lib/commands';
  import { onPaletteOpened, onSettingsChanged } from '$lib/events';
  import { ipc, loadState } from '$lib/ipc';
  import { DEFAULT_SETTINGS, type Platform, type Settings } from '$lib/settings';
  import Icon from '$lib/ui/Icon.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { applyAccent, applyTheme, prefersReducedMotion } from '$lib/ui/theme';
  import ResultRow from './ResultRow.svelte';

  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let platform = $state<Platform>('windows');
  let query = $state('');
  let selected = $state(0);
  let error = $state<string | null>(null);
  let running = false;

  let panel: HTMLElement;
  let input: HTMLInputElement;
  let list = $state<HTMLElement>();

  const pet = $derived(getPet(settings.petId));
  const commands = $derived(buildCommands({ settings, platform }));
  const sections = $derived(searchCommands(commands, query));
  const flat = $derived(sections.flatMap((s) => s.items.map((r) => r.item)));
  /** Index of each group's first row in `flat`. */
  const offsets = $derived.by(() => {
    let start = 0;
    return sections.map((s) => (start += s.items.length) - s.items.length);
  });
  // Settings can change underneath an open palette; never point past the end.
  const active = $derived(Math.min(selected, flat.length - 1));

  $effect(() => applyTheme(settings.theme));
  $effect(() => applyAccent(pet.accent));

  // Keep the selected row in view.
  $effect(() => {
    const id = `cmd-${active}`;
    tick().then(() => list?.querySelector(`#${id}`)?.scrollIntoView({ block: 'nearest' }));
  });

  const hide = () => ipc.hidePalette().catch(() => {});

  function select(index: number) {
    if (flat.length) selected = Math.max(0, Math.min(flat.length - 1, index));
  }

  function move(delta: number) {
    if (flat.length) selected = (active + delta + flat.length) % flat.length;
  }

  async function run(command: Command | undefined) {
    if (!command || running) return;
    running = true;
    error = null;
    try {
      await command.run();
      await hide();
    } catch (err) {
      error = String(err);
    } finally {
      running = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Tab: () => move(e.shiftKey ? -1 : 1),
      Home: () => select(0),
      End: () => select(flat.length - 1),
      PageDown: () => select(active + 5),
      PageUp: () => select(active - 5),
      Enter: () => run(flat[active]),
      Escape: hide,
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }

  function reset() {
    query = '';
    selected = 0;
    error = null;
    tick().then(() => input?.focus());
    if (!prefersReducedMotion()) {
      panel?.animate(
        [
          { opacity: 0, transform: 'translateY(-6px) scale(0.985)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  }

  // Clicks on the transparent margin around the panel dismiss it, like clicking away.
  function onWindowMousedown(e: MouseEvent) {
    if (!panel.contains(e.target as Node)) hide();
  }

  onMount(() => {
    const listeners: Promise<UnlistenFn>[] = [
      onSettingsChanged((next) => (settings = next)),
      onPaletteOpened(reset),
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) hide();
      }),
    ];
    loadState()
      .then((state) => (settings = state.settings))
      .catch(() => {});
    ipc
      .appInfo()
      .then((info) => (platform = info.platform))
      .catch(() => {});
    input.focus();
    return () => listeners.forEach((p) => p.then((unlisten) => unlisten()));
  });
</script>

<svelte:window onmousedown={onWindowMousedown} />

<div class="panel" bind:this={panel}>
  <div class="search">
    <div class="avatar"><Sprite {pet} scale={1} /></div>
    <input
      bind:this={input}
      bind:value={query}
      oninput={() => (selected = 0)}
      {onkeydown}
      type="text"
      placeholder={`What should ${pet.name} do?`}
      spellcheck="false"
      autocomplete="off"
      role="combobox"
      aria-label="Search commands"
      aria-expanded="true"
      aria-controls="palette-results"
      aria-autocomplete="list"
      aria-activedescendant={flat.length ? `cmd-${active}` : undefined}
    />
    <kbd class="kbd esc">Esc</kbd>
  </div>

  <div class="results" id="palette-results" role="listbox" aria-label="Commands" bind:this={list}>
    {#each sections as section, s (section.group)}
      <div class="group" role="group" aria-labelledby={`group-${section.group}`}>
        <div class="group-label" id={`group-${section.group}`}>{section.group}</div>
        {#each section.items as { item, indices }, j (item.id)}
          {@const index = offsets[s] + j}
          <ResultRow
            command={item}
            {indices}
            id={`cmd-${index}`}
            selected={index === active}
            onhover={() => (selected = index)}
            onrun={() => run(item)}
          />
        {/each}
      </div>
    {:else}
      <div class="empty">
        <Sprite {pet} animation="sleep" scale={2} />
        <p>Nothing matches “{query.trim()}”.<br />{pet.name} is as puzzled as you are.</p>
      </div>
    {/each}
  </div>

  <footer>
    {#if error}
      <span class="error" role="alert">{error}</span>
    {:else}
      <span class="brand"><Icon name="sparkle" size={13} /><span class="pixel">Desktop Buddy</span></span>
    {/if}
    <span class="keys">
      <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> Navigate</span>
      <span><kbd class="kbd">↵</kbd> Run</span>
      <span><kbd class="kbd">Esc</kbd> Close</span>
    </span>
  </footer>
</div>

<style>
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  /* 16px transparent margin leaves room for the shadow inside the window. */
  .panel {
    position: absolute;
    top: 16px;
    right: 16px;
    left: 16px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 32px);
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
  }

  .search {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-3);
    height: 60px;
    padding: 0 var(--space-4) 0 var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .avatar {
    display: grid;
    flex: none;
    place-items: end center;
    width: 38px;
    height: 38px;
    overflow: hidden;
    border-radius: var(--radius);
    background: radial-gradient(circle at 50% 85%, var(--accent-glow), transparent 70%), var(--surface-2);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font-size: 17px;
  }
  input::placeholder {
    color: var(--text-3);
  }
  .esc {
    flex: none;
  }

  .results {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-1) var(--space-2) var(--space-2);
    scroll-padding: var(--space-2);
  }
  .group-label {
    padding: var(--space-3) var(--space-2) var(--space-1);
    color: var(--text-3);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
    color: var(--text-2);
    text-align: center;
  }
  .empty p {
    margin: 0;
    font-size: 13px;
  }

  footer {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    height: 38px;
    padding: 0 var(--space-3) 0 var(--space-4);
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-3);
    font-size: 12px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent-fg);
  }
  .brand .pixel {
    color: var(--text-2);
    font-size: 13px;
  }
  .error {
    overflow: hidden;
    color: var(--danger);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .keys {
    display: inline-flex;
    flex: none;
    gap: var(--space-3);
  }
  .keys > span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .keys .kbd {
    min-width: 18px;
    height: 18px;
    font-size: 10.5px;
  }
</style>
