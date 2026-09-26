<!-- An accelerator ("Alt+Shift+B") rendered as keycaps. -->
<script lang="ts">
  import type { Platform } from '$lib/settings';
  import { acceleratorKeys } from './hotkey';

  let { accelerator, platform }: { accelerator: string; platform: Platform } = $props();
</script>

<span class="keys" aria-label={accelerator}>
  {#each acceleratorKeys(accelerator, platform) as key, i (i)}
    <kbd class="kbd">{key}</kbd>
  {/each}
</span>

<style>
  .keys {
    display: inline-flex;
    gap: 3px;
    vertical-align: middle;
  }
</style>
