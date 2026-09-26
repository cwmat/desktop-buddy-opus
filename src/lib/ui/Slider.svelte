<script lang="ts">
  interface Props {
    value: number;
    min: number;
    max: number;
    step: number;
    label: string;
    format: (value: number) => string;
    /**
     * Report every step while dragging, for settings that preview live (size, opacity).
     * Otherwise only the value the thumb is released on is reported: each report is a write.
     */
    live?: boolean;
    onchange: (value: number) => void;
  }

  let { value, min, max, step, label, format, live = true, onchange }: Props = $props();

  /** Where the thumb is while a non-live slider is being dragged. */
  let pending = $state<number | null>(null);
  const shown = $derived(pending ?? value);
  const fill = $derived(`${((shown - min) / (max - min)) * 100}%`);

  function oninput(next: number) {
    if (live) onchange(next);
    // Back where it started means no `change` event on release: nothing is pending then.
    else pending = next === value ? null : next;
  }

  function commit(next: number) {
    if (live) return;
    pending = null;
    if (next !== value) onchange(next);
  }
</script>

<div class="slider">
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    aria-label={label}
    aria-valuetext={format(shown)}
    style:--fill={fill}
    oninput={(e) => oninput(Number(e.currentTarget.value))}
    onchange={(e) => commit(Number(e.currentTarget.value))}
  />
  <output>{format(shown)}</output>
</div>

<style>
  .slider {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-3);
  }
  output {
    min-width: 44px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  input {
    width: 180px;
    height: 20px;
    margin: 0;
    background: none;
    appearance: none;
  }
  input::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: linear-gradient(to right, var(--accent-fg) var(--fill), var(--surface-3) var(--fill));
  }
  input::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    appearance: none;
    transition: transform var(--dur-fast) var(--ease);
  }
  input:hover::-webkit-slider-thumb {
    transform: scale(1.12);
  }
  input:active::-webkit-slider-thumb {
    transform: scale(0.95);
  }
  input:focus-visible {
    outline: none;
  }
  input:focus-visible::-webkit-slider-thumb {
    outline: 2px solid var(--accent-fg);
    outline-offset: 2px;
  }
</style>
