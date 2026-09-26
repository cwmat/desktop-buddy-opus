<!-- Text with fuzzy-matched characters emphasised. -->
<script lang="ts">
  import { highlightSegments } from '$lib/fuzzy';

  let { text, indices = [] }: { text: string; indices?: readonly number[] } = $props();
</script>

{#each highlightSegments(text, indices) as segment, i (i)}{#if segment.match}<mark>{segment.text}</mark
    >{:else}{segment.text}{/if}{/each}

<style>
  mark {
    background: none;
    color: var(--accent-fg);
    font-weight: 700;
  }
</style>
