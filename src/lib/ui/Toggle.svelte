<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    onchange: (checked: boolean) => void;
  }

  let { checked, label, onchange }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  class="toggle"
  class:on={checked}
  aria-checked={checked}
  aria-label={label}
  onclick={() => onchange(!checked)}
>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    position: relative;
    flex: none;
    width: 40px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: var(--surface-3);
    transition:
      background-color var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .toggle:hover {
    border-color: var(--text-3);
  }
  .on,
  .on:hover {
    border-color: transparent;
    background: var(--accent-fg);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.25),
      0 0 0 0.5px rgb(0 0 0 / 0.06);
    transition: transform var(--dur) var(--ease-spring);
  }
  .on .knob {
    transform: translateX(18px);
  }
  .toggle:active .knob {
    width: 19px;
  }
  .on:active .knob {
    transform: translateX(15px);
  }
</style>
