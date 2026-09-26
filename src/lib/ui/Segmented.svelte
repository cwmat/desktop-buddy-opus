<!-- Segmented control (a radio group): arrow keys move the selection, like native radios. -->
<script lang="ts">
  import type { SelectOption } from '$lib/settings';

  interface Props {
    options: readonly SelectOption[];
    value: string;
    label: string;
    onchange: (value: string) => void;
  }

  let { options, value, label, onchange }: Props = $props();

  let group: HTMLDivElement;
  const buttons: HTMLButtonElement[] = [];
  const selected = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
  let indicator = $state({ x: 0, width: 0 });
  /** Only animate the pill after it has been placed once (no slide-in on mount). */
  let placed = $state(false);

  // The sliding pill follows the selected segment; re-measure when fonts/layout change.
  $effect(() => {
    const measure = () => {
      const el = buttons[selected];
      if (el) indicator = { x: el.offsetLeft, width: el.offsetWidth };
    };
    measure();
    const raf = requestAnimationFrame(() => (placed = true));
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  });

  // Re-picking the current option would still be a settings write; skip it.
  function pick(next: string) {
    if (next !== value) onchange(next);
  }

  function onkeydown(e: KeyboardEvent, i: number) {
    const last = options.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % options.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i + last) % options.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (next === -1) return;
    e.preventDefault();
    pick(options[next].value);
    buttons[next]?.focus();
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label} bind:this={group}>
  <span class="indicator" class:placed style:transform="translateX({indicator.x}px)" style:width="{indicator.width}px"></span>
  {#each options as option, i (option.value)}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={i === selected}
      tabindex={i === selected ? 0 : -1}
      title={option.description}
      onclick={() => pick(option.value)}
      onkeydown={(e) => onkeydown(e, i)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    position: relative;
    display: inline-flex;
    flex: none;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .indicator {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 0;
    border-radius: 5px;
    background: var(--surface);
    box-shadow:
      var(--shadow-sm),
      0 0 0 1px var(--border);
  }
  .indicator.placed {
    transition:
      transform var(--dur) var(--ease),
      width var(--dur) var(--ease);
  }
  button {
    position: relative;
    height: 26px;
    padding: 0 12px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text-2);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    transition: color var(--dur-fast) var(--ease);
  }
  button:hover {
    color: var(--text);
  }
  button[aria-checked='true'] {
    color: var(--text);
  }
  button:focus-visible {
    outline-offset: 0;
  }
</style>
