<script lang="ts">
  import { onMount } from 'svelte';
  import { PETS, getPet } from '$pets';
  import { emitPetAction } from '$lib/events';
  import type { Platform, Settings } from '$lib/settings';
  import { decay, type StatsMap } from '$lib/stats';
  import Keys from '$lib/ui/Keys.svelte';
  import BuddyCard from './BuddyCard.svelte';

  interface Props {
    settings: Settings;
    stats: StatsMap;
    platform: Platform;
    onselect: (petId: string) => void;
  }

  let { settings, stats, platform, onselect }: Props = $props();

  const activeId = $derived(getPet(settings.petId).id);

  // Stats drift slowly; re-apply decay now and then so meters stay honest between updates.
  let now = $state(Date.now());
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });
</script>

<p class="tip">
  Switch anytime from the command palette:
  <Keys accelerator={settings.paletteHotkey} {platform} />
</p>

<div class="gallery">
  {#each PETS as pet (pet.id)}
    <BuddyCard
      {pet}
      active={pet.id === activeId}
      stats={stats[pet.id] ? decay(stats[pet.id], Math.max(now, stats[pet.id].updatedAt)) : undefined}
      needs={settings.needs}
      onselect={() => onselect(pet.id)}
      onaction={(action) => void emitPetAction(action)}
    />
  {/each}
</div>

<style>
  .tip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0 0 var(--space-4);
    color: var(--text-3);
    font-size: 12.5px;
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(236px, 1fr));
    gap: var(--space-4);
  }
</style>
