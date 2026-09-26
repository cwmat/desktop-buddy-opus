<!-- A Tamagotchi-style segmented meter: `value` out of `total` chunky pips. -->
<script lang="ts">
  interface Props {
    /** Filled pips (rounded), 0..total. */
    value: number;
    total?: number;
    label: string;
    /** Any CSS color; defaults to the accent. */
    color?: string;
  }

  let { value, total = 10, label, color = 'var(--accent-fg)' }: Props = $props();

  const filled = $derived(Math.max(0, Math.min(total, Math.round(value))));
</script>

<span class="pips" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled} style:--pip={color}>
  {#each { length: total }, i (i)}
    <span class="pip" class:on={i < filled}></span>
  {/each}
</span>

<style>
  .pips {
    display: inline-flex;
    gap: 2px;
  }
  .pip {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--surface-3);
    transition: background-color var(--dur) var(--ease);
  }
  .on {
    background: var(--pip);
    box-shadow: inset 0 -2px 0 rgb(0 0 0 / 0.14);
  }
</style>
