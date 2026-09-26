<!--
  A trading-card for one buddy. The whole card is a select button (stretched under the
  content); the active buddy also gets quick actions, which sit above it.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PetAction } from '$lib/events';
  import { moodOf, type Mood, type PetStats } from '$lib/stats';
  import { accentShades } from '$lib/ui/color';
  import Icon from '$lib/ui/Icon.svelte';
  import Pips from '$lib/ui/Pips.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import type { AnimationName, PetDefinition, Personality } from '$pets/types';

  interface Props {
    pet: PetDefinition;
    active: boolean;
    /** Already decayed to "now"; undefined if never adopted. */
    stats?: PetStats;
    needs: boolean;
    onselect: () => void;
    onaction: (action: PetAction) => void;
  }

  let { pet, active, stats, needs, onselect, onaction }: Props = $props();

  const TRAITS: [keyof Personality, string][] = [
    ['debugging', 'Debugging'],
    ['patience', 'Patience'],
    ['chaos', 'Chaos'],
    ['wisdom', 'Wisdom'],
    ['snark', 'Snark'],
  ];

  const MOODS: Record<Mood, string> = {
    happy: 'Feeling great',
    content: 'Content',
    hungry: 'A bit peckish',
    lonely: 'Wants a pat',
  };

  const shades = $derived(accentShades(pet.accent));

  let hovered = $state(false);
  let reaction = $state<AnimationName | null>(null);
  let reactionTimer: ReturnType<typeof setTimeout> | undefined;
  const animation = $derived<AnimationName>(reaction ?? (hovered ? 'walk' : 'idle'));

  function react(name: AnimationName) {
    reaction = name;
    clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => (reaction = null), 1600);
  }

  function act(action: PetAction, name: AnimationName) {
    onaction(action);
    react(name);
  }

  onDestroy(() => clearTimeout(reactionTimer));
</script>

<article
  class="card tint"
  class:active
  style:--tint-on-light={shades.light}
  style:--tint-on-dark={shades.dark}
  style:--card-accent={shades.base}
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
>
  <button
    type="button"
    class="select"
    aria-pressed={active}
    aria-label={active ? `${pet.name} is keeping you company` : `Choose ${pet.name}`}
    onclick={() => {
      if (!active) onselect();
      react('happy');
    }}
    onfocus={() => (hovered = true)}
    onblur={() => (hovered = false)}
  ></button>

  <div class="stage">
    {#if active}
      <span class="badge">With you now</span>
    {/if}
    <Sprite {pet} {animation} scale={3} label={`${pet.name} the ${pet.species}`} />
  </div>

  <div class="body">
    <header>
      <h3 class="pixel">{pet.name}</h3>
      <p class="species">{pet.species}</p>
    </header>
    <p class="tagline">{pet.tagline}</p>

    <dl class="traits">
      {#each TRAITS as [key, label] (key)}
        <dt>{label}</dt>
        <dd>
          <Pips value={pet.personality[key]} label={`${label}: ${pet.personality[key]} of 10`} color="var(--tint)" />
          <span class="num">{pet.personality[key]}</span>
        </dd>
      {/each}
    </dl>

    {#if stats}
      <div class="stats">
        <div class="stats-head">
          {#if needs}
            <span class="pixel mood">{MOODS[moodOf(stats)]}</span>
          {/if}
          <span class="counts">
            <span><strong>{stats.treats}</strong> {stats.treats === 1 ? 'treat' : 'treats'}</span>
            <span><strong>{stats.pats}</strong> {stats.pats === 1 ? 'pat' : 'pats'}</span>
          </span>
        </div>
        {#if needs}
          <div class="need">
            <span>Happiness</span>
            <Pips value={stats.happiness / 10} label={`Happiness ${Math.round(stats.happiness)}%`} color="var(--love)" />
          </div>
          <div class="need">
            <span>Fullness</span>
            <Pips value={stats.fullness / 10} label={`Fullness ${Math.round(stats.fullness)}%`} color="var(--food)" />
          </div>
        {/if}
      </div>
    {:else}
      <p class="new">Hasn’t met you yet.</p>
    {/if}

    {#if active}
      <div class="actions">
        <button
          type="button"
          class="btn small"
          aria-label={`Give ${pet.name} a treat`}
          onclick={() => act({ type: 'treat' }, 'eat')}
        >
          <Icon name="treat" size={14} /> Treat
        </button>
        <button type="button" class="btn small" aria-label={`Pat ${pet.name}`} onclick={() => act({ type: 'pat' }, 'happy')}>
          <Icon name="pat" size={14} /> Pat
        </button>
        <button
          type="button"
          class="btn small"
          aria-label={`Call ${pet.name} home`}
          onclick={() => act({ type: 'go-home' }, 'walk')}
        >
          <Icon name="home" size={14} /> Call home
        </button>
      </div>
    {/if}
  </div>
</article>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    transition:
      transform var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow);
    border-color: var(--border-strong);
  }
  .card.active {
    border-color: var(--accent-fg);
    box-shadow:
      0 0 0 3px var(--accent-soft),
      var(--shadow);
  }
  .card:has(.select:focus-visible) {
    outline: 2px solid var(--accent-fg);
    outline-offset: 2px;
  }

  /* Stretched click target under the content; interactive bits sit above it. */
  .select {
    position: absolute;
    inset: 0;
    z-index: 1;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .select:focus-visible {
    outline: none;
  }
  .card.active .select {
    cursor: default;
  }

  .stage {
    position: relative;
    display: grid;
    place-items: end center;
    height: 132px;
    padding-bottom: 14px;
    background:
      radial-gradient(ellipse 60% 70% at 50% 100%, color-mix(in srgb, var(--card-accent) 30%, transparent), transparent 70%),
      linear-gradient(to bottom, var(--surface-2), color-mix(in srgb, var(--card-accent) 8%, var(--surface-2)));
    border-bottom: 1px solid var(--border);
  }
  /* Little pixel floor the buddy stands on. */
  .stage::after {
    content: '';
    position: absolute;
    bottom: 10px;
    left: 50%;
    width: 72px;
    height: 4px;
    translate: -50% 0;
    background: color-mix(in srgb, var(--text) 12%, transparent);
    clip-path: polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 0 4px);
  }
  .stage :global(canvas) {
    position: relative;
    z-index: 0;
    margin-bottom: 2px;
  }
  .badge {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 3px 8px;
    border-radius: var(--radius-pill);
    background: var(--accent-fg);
    color: var(--on-accent);
    font-family: var(--font-pixel);
    font-size: 12px;
    line-height: 1.2;
    box-shadow: var(--shadow-sm);
  }

  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0 var(--space-2);
  }
  h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.1;
  }
  .species {
    margin: 0;
    color: var(--tint);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .tagline {
    margin: 0;
    color: var(--text-2);
    font-size: 12.5px;
    line-height: 1.45;
  }

  .traits {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 5px var(--space-3);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  dt {
    color: var(--text-2);
    font-size: 11.5px;
  }
  dd {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    margin: 0;
  }
  .num {
    width: 16px;
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .stats {
    display: grid;
    gap: 6px;
  }
  .stats-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .mood {
    color: var(--text);
    font-size: 14px;
  }
  .need {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text-2);
    font-size: 11.5px;
  }
  .counts {
    display: flex;
    gap: var(--space-3);
    margin-left: auto;
    color: var(--text-3);
    font-size: 11.5px;
  }
  .counts strong {
    color: var(--text-2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .new {
    margin: 0;
    color: var(--text-3);
    font-size: 12px;
    font-style: italic;
  }

  .actions {
    position: relative;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: auto;
  }
  .actions .btn {
    flex: 1 1 auto;
  }
</style>
