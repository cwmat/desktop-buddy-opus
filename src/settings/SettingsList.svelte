<!-- A card of setting rows: label + description on the left, control on the right. -->
<script lang="ts">
  import { getPet } from '$pets';
  import type { Platform, SettingSection, Settings } from '$lib/settings';
  import Highlight from '$lib/ui/Highlight.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import SettingControl from './SettingControl.svelte';
  import { sectionLabel, type Row, type RowMatch } from './rows';
  import type { UpdateFn } from './types';

  interface Props {
    matches: RowMatch[];
    settings: Settings;
    platform: Platform;
    /** Search mode: show which section each row lives in. */
    showSection?: boolean;
    onupdate: UpdateFn;
    onnavigate: (section: SettingSection) => void;
  }

  let { matches, settings, platform, showSection = false, onupdate, onnavigate }: Props = $props();

  const activeId = $derived(getPet(settings.petId).id);

  function textOf(row: Row): { label: string; description: string; note?: string } {
    switch (row.kind) {
      case 'setting': {
        const def = row.def;
        const note =
          def.kind === 'select' ? def.options.find((o) => o.value === settings[def.key])?.description : undefined;
        return { label: def.label, description: def.description, note };
      }
      case 'action':
        return { label: row.action.label, description: row.action.description };
      case 'buddy':
        return { label: row.pet.name, description: `${row.pet.species} · ${row.pet.tagline}` };
    }
  }

  let running = $state<string | null>(null);

  async function runAction(row: Extract<Row, { kind: 'action' }>) {
    running = row.id;
    try {
      await row.action.run();
    } finally {
      running = null;
    }
  }
</script>

<div class="list">
  {#each matches as { row, indices } (row.id)}
    {@const text = textOf(row)}
    <div class="row" class:wide={row.kind === 'setting' && row.def.kind === 'select'}>
      {#if row.kind === 'buddy'}
        <div class="avatar"><Sprite pet={row.pet} scale={1} /></div>
      {/if}
      <div class="text">
        <div class="label" class:pixel={row.kind === 'buddy'}>
          <span><Highlight text={text.label} {indices} /></span>
          {#if showSection}
            <!-- Mouse shortcut only; keyboard users have the section nav. -->
            <button
              type="button"
              class="chip"
              tabindex="-1"
              title="Go to {sectionLabel(row.section)}"
              onclick={() => onnavigate(row.section)}
            >
              {sectionLabel(row.section)}
            </button>
          {/if}
        </div>
        <p class="description">{text.description}</p>
        {#if text.note}
          <p class="note">{text.note}</p>
        {/if}
      </div>
      <div class="control">
        {#if row.kind === 'setting'}
          <SettingControl def={row.def} {settings} {platform} {onupdate} />
        {:else if row.kind === 'action'}
          <button
            type="button"
            class="btn"
            class:danger={row.action.danger}
            disabled={running === row.id}
            onclick={() => runAction(row)}
          >
            {row.action.button}
          </button>
        {:else if row.pet.id === activeId}
          <span class="badge">With you now</span>
        {:else}
          <button type="button" class="btn" onclick={() => onupdate({ petId: row.pet.id })}>Switch</button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .list {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-5);
    padding: var(--space-3) var(--space-4);
    min-height: 64px;
  }
  .row + .row {
    border-top: 1px solid var(--border);
  }
  .text {
    flex: 1 1 260px;
    min-width: 0;
  }
  .wide .text {
    flex-basis: 220px;
  }
  .label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
  }
  .label.pixel {
    font-size: 16px;
    font-weight: 500;
  }
  .description {
    margin: 2px 0 0;
    color: var(--text-2);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .note {
    margin: 4px 0 0;
    padding-left: 10px;
    border-left: 2px solid var(--accent-fg);
    color: var(--text-2);
    font-size: 12px;
  }
  .control {
    display: flex;
    flex: none;
    justify-content: flex-end;
    margin-left: auto;
  }
  .avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius);
    background: var(--accent-softer);
  }
  .chip {
    height: 20px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: 11px;
    font-weight: 500;
  }
  .chip:hover {
    border-color: var(--accent-fg);
    color: var(--accent-fg);
  }
  .badge {
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-fg);
    font-family: var(--font-pixel);
    font-size: 13px;
  }
</style>
