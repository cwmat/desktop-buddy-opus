<!-- The right-hand control for one SETTING_DEFS entry. -->
<script lang="ts">
  import type { Platform, SettingDef, Settings } from '$lib/settings';
  import HotkeyInput from '$lib/ui/HotkeyInput.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Slider from '$lib/ui/Slider.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import type { UpdateFn } from './types';

  interface Props {
    def: SettingDef;
    settings: Settings;
    platform: Platform;
    onupdate: UpdateFn;
  }

  let { def, settings, platform, onupdate }: Props = $props();
</script>

{#if def.kind === 'toggle'}
  <Toggle checked={settings[def.key]} label={def.label} onchange={(v) => onupdate({ [def.key]: v })} />
{:else if def.kind === 'select'}
  <Segmented
    options={def.options}
    value={settings[def.key]}
    label={def.label}
    onchange={(v) => onupdate({ [def.key]: v } as Partial<Settings>)}
  />
{:else if def.kind === 'range'}
  <Slider
    value={settings[def.key]}
    min={def.min}
    max={def.max}
    step={def.step}
    format={def.format}
    label={def.label}
    onchange={(v) => onupdate({ [def.key]: v })}
  />
{:else if def.kind === 'hotkey'}
  <HotkeyInput
    value={settings[def.key]}
    {platform}
    label={def.label}
    onchange={(accelerator) => onupdate({ [def.key]: accelerator }, { inlineError: true })}
  />
{/if}
