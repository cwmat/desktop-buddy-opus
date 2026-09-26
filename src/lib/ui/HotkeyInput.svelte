<!--
  Shortcut recorder: click (or Enter/Space), press a combo, done. Esc cancels.
  `onchange` resolves to an error message when Rust refuses the shortcut.
-->
<script lang="ts">
  import type { Platform } from '$lib/settings';
  import { acceleratorKeys, modifiersOf, recordKey } from './hotkey';
  import Keys from './Keys.svelte';

  interface Props {
    value: string;
    platform: Platform;
    label: string;
    onchange: (accelerator: string) => Promise<string | null>;
  }

  let { value, platform, label, onchange }: Props = $props();

  let recording = $state(false);
  let held = $state<string[]>([]);
  let error = $state<string | null>(null);
  let saving = $state(false);

  function start() {
    recording = true;
    held = [];
    error = null;
  }

  function stop() {
    recording = false;
    held = [];
  }

  async function onkeydown(e: KeyboardEvent) {
    if (!recording) return;
    // Let a bare Tab move focus on as usual.
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      stop();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const result = recordKey(e, platform);
    if (result.kind === 'cancel') {
      stop();
    } else if (result.kind === 'partial') {
      held = result.modifiers;
    } else if (result.kind === 'invalid') {
      error = result.reason;
      held = [];
    } else {
      // Send it even when it matches `value`: the shown shortcut may not be the one
      // registered (another app took it at login), and a retry re-registers or explains why not.
      stop();
      saving = true;
      error = await onchange(result.accelerator);
      saving = false;
    }
  }

  function onkeyup(e: KeyboardEvent) {
    if (recording) held = modifiersOf(e, platform);
  }
</script>

<div class="hotkey">
  <button
    type="button"
    class="field"
    class:recording
    class:invalid={!!error}
    aria-label={recording ? `Recording shortcut for ${label}` : `${label}: ${acceleratorKeys(value, platform).join(' ')}. Press to change.`}
    aria-busy={saving}
    onclick={() => (recording ? stop() : start())}
    {onkeydown}
    {onkeyup}
    onblur={stop}
  >
    {#if recording}
      {#if held.length}
        <Keys accelerator={held.join('+')} {platform} />
        <span class="plus">+ …</span>
      {:else}
        <span class="prompt">Press a shortcut…</span>
      {/if}
    {:else}
      <Keys accelerator={value} {platform} />
    {/if}
  </button>
  <p class="note" class:error={!!error} role={error ? 'alert' : undefined}>
    {#if error}
      {error}
    {:else if recording}
      Esc to cancel
    {:else}
      Click to change
    {/if}
  </p>
</div>

<style>
  .hotkey {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
    max-width: 280px;
  }
  .field {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 168px;
    height: 34px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    transition:
      border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .field:hover {
    border-color: var(--text-3);
  }
  .recording,
  .recording:hover {
    border-color: var(--accent-fg);
    box-shadow: 0 0 0 3px var(--accent-soft);
    background: var(--surface);
  }
  .invalid:not(.recording) {
    border-color: var(--danger);
  }
  .recording:focus-visible {
    outline: none;
  }
  .prompt {
    color: var(--accent-fg);
    font-size: 12.5px;
    font-weight: 500;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .plus {
    color: var(--text-3);
    font-size: 12px;
  }
  .note {
    margin: 0;
    color: var(--text-3);
    font-size: 11.5px;
    text-align: right;
  }
  .note.error {
    color: var(--danger);
  }
  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }
</style>
