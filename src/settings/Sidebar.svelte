<script lang="ts">
  import type { PetDefinition } from '$pets/types';
  import { SECTIONS, type Platform, type SettingSection } from '$lib/settings';
  import Icon from '$lib/ui/Icon.svelte';
  import Keys from '$lib/ui/Keys.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';

  interface Props {
    pet: PetDefinition;
    section: SettingSection;
    query: string;
    platform: Platform;
    version: string;
    onnavigate: (section: SettingSection) => void;
    /** Enter / ↓ in the search field: move focus into the results. */
    onsearchenter: () => void;
  }

  let { pet, section, query = $bindable(), platform, version, onnavigate, onsearchenter }: Props = $props();

  let input: HTMLInputElement;
  const searching = $derived(query.trim().length > 0);

  export function focusSearch() {
    input.focus();
    input.select();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) query = '';
      else input.blur();
    } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      onsearchenter();
    }
  }
</script>

<aside class="sidebar">
  <div class="brand">
    <div class="avatar"><Sprite {pet} scale={1} /></div>
    <div>
      <div class="pixel title">Desktop Buddy</div>
      <div class="subtitle">with {pet.name}</div>
    </div>
  </div>

  <label class="search">
    <Icon name="search" size={15} />
    <input
      bind:this={input}
      bind:value={query}
      type="search"
      placeholder="Search settings"
      aria-label="Search settings"
      spellcheck="false"
      autocomplete="off"
      {onkeydown}
    />
    {#if !query}
      <Keys accelerator="CommandOrControl+K" {platform} />
    {/if}
  </label>

  <nav aria-label="Settings sections">
    {#each SECTIONS as s (s.id)}
      <button
        type="button"
        class:current={s.id === section && !searching}
        aria-current={s.id === section && !searching ? 'page' : undefined}
        onclick={() => onnavigate(s.id)}
      >
        <Icon name={s.id} size={17} />
        {s.label}
      </button>
    {/each}
  </nav>

  <footer>
    <span class="pixel">v{version || '…'}</span>
    <span class="dot" aria-hidden="true"></span>
    <span>Made with pixels</span>
  </footer>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 232px;
    flex: none;
    padding: var(--space-4) var(--space-3);
    border-right: 1px solid var(--border);
    background: var(--bg-sidebar);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-2);
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: radial-gradient(circle at 50% 80%, var(--accent-glow), transparent 70%), var(--surface);
    box-shadow: var(--shadow-sm);
  }
  .title {
    font-size: 17px;
    font-weight: 600;
    line-height: 1.1;
  }
  .subtitle {
    color: var(--text-3);
    font-size: 12px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 34px;
    padding: 0 var(--space-2) 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-3);
    transition:
      border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .search:focus-within {
    border-color: var(--accent-fg);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font-size: 13px;
  }
  .search input::placeholder {
    color: var(--text-3);
  }
  .search input::-webkit-search-cancel-button {
    display: none;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  nav button {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 34px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-2);
    font-size: 13.5px;
    font-weight: 500;
    text-align: left;
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  nav button:hover {
    background: var(--hover);
    color: var(--text);
  }
  nav button.current {
    background: var(--surface);
    color: var(--text);
    box-shadow:
      var(--shadow-sm),
      0 0 0 1px var(--border);
  }
  nav button.current :global(svg) {
    color: var(--accent-fg);
  }
  /* Pixel-y marker on the current section. */
  nav button.current::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 50%;
    width: 4px;
    height: 12px;
    translate: 0 -50%;
    background: var(--accent-fg);
    box-shadow: 0 2px 0 var(--accent-fg);
  }

  footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: auto;
    padding: 0 var(--space-2);
    color: var(--text-3);
    font-size: 11.5px;
  }
  footer .pixel {
    font-size: 13px;
  }
  .dot {
    width: 3px;
    height: 3px;
    background: currentColor;
  }
</style>
