<script lang="ts">
  import { getPet } from '$pets';
  import { HINT, type Command } from '$lib/commands';
  import Highlight from '$lib/ui/Highlight.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';

  interface Props {
    command: Command;
    indices: number[];
    id: string;
    selected: boolean;
    /** False while the palette is hidden, so buddy sprites stay still. */
    playing: boolean;
    onhover: () => void;
    onrun: () => void;
  }

  let { command, indices, id, selected, playing, onhover, onrun }: Props = $props();
</script>

<!-- Focus stays in the search input (combobox); rows are pointer targets only. -->
<button
  type="button"
  role="option"
  tabindex="-1"
  {id}
  class="row"
  class:selected
  aria-selected={selected}
  onmousedown={(e) => e.preventDefault()}
  onpointermove={onhover}
  onclick={onrun}
>
  <span class="glyph" class:buddy={!!command.petId}>
    {#if command.petId}
      <Sprite pet={getPet(command.petId)} scale={1} animation={selected ? 'walk' : 'idle'} playing={playing && selected} />
    {:else if command.icon}
      <Icon name={command.icon} size={16} />
    {/if}
  </span>
  <span class="text">
    <span class="title"><Highlight text={command.title} {indices} /></span>
    {#if command.subtitle}
      <span class="subtitle">{command.subtitle}</span>
    {/if}
  </span>
  {#if command.hint === HINT.current}
    <span class="hint current">Current</span>
  {:else if command.hint === HINT.on || command.hint === HINT.off}
    <span class="hint state" class:on={command.hint === HINT.on}>{command.hint}</span>
  {:else if command.hint}
    <span class="hint">{command.hint}</span>
  {/if}
  <span class="enter kbd" aria-hidden="true">↵</span>
</button>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 44px;
    padding: 5px var(--space-2);
    border: 0;
    border-radius: var(--radius);
    background: none;
    text-align: left;
  }
  .row.selected {
    background: var(--accent-soft);
  }
  .glyph {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
    transition:
      color var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease);
  }
  .glyph.buddy {
    overflow: hidden;
    align-items: end;
  }
  .selected .glyph {
    border-color: color-mix(in srgb, var(--accent-fg) 35%, var(--border));
    background: var(--surface);
    color: var(--accent-fg);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .title,
  .subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
  }
  .subtitle {
    color: var(--text-3);
    font-size: 12px;
  }
  .selected .subtitle {
    color: var(--text-2);
  }
  .hint {
    flex: none;
    max-width: 180px;
    overflow: hidden;
    color: var(--text-3);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint.current {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--accent-fg);
    color: var(--on-accent);
    font-family: var(--font-pixel);
    font-size: 12px;
  }
  .hint.state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    font-weight: 600;
  }
  .hint.state::before {
    content: '';
    width: 6px;
    height: 6px;
    background: var(--text-3);
  }
  .hint.state.on {
    color: var(--text-2);
  }
  .hint.state.on::before {
    background: #2fb86b;
    box-shadow: 0 0 6px #2fb86b;
  }
  .enter {
    visibility: hidden;
    flex: none;
  }
  .selected .enter {
    visibility: visible;
  }
</style>
