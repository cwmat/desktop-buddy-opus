<!--
  Animated buddy sprite. Always crisp: integer device pixels per sprite pixel,
  no smoothing. Honors prefers-reduced-motion by showing a still frame, and only
  animates while it can be seen (on screen, page not hidden, `playing`).
-->
<script lang="ts">
  import { devicePixelRatio } from 'svelte/reactivity/window';
  import { SPRITE_SIZE, type AnimationName, type PetDefinition } from '$pets/types';
  import { animationFor, framesOf } from './sprites';
  import { prefersReducedMotion } from './theme';

  interface Props {
    pet: PetDefinition;
    animation?: AnimationName;
    /** CSS px per sprite pixel (rounded to whole device pixels). */
    scale?: number;
    /** Animate; false shows the first frame. Pass false while the window is hidden. */
    playing?: boolean;
    /** Mirror horizontally (sprites face right). */
    flip?: boolean;
    /** Accessible name; omit for decorative sprites. */
    label?: string;
  }

  let { pet, animation = 'idle', scale = 2, playing = true, flip = false, label }: Props = $props();

  let canvas: HTMLCanvasElement;
  /** Scrolled into view (e.g. a gallery card further down isn't). */
  let onScreen = $state(true);
  let pageHidden = $state(document.hidden);

  $effect(() => {
    // Entries arrive oldest first; a fast scroll can batch a leave and a re-enter.
    const observer = new IntersectionObserver((entries) => (onScreen = entries.at(-1)!.isIntersecting));
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  const blinkDelay = () => 2200 + Math.random() * 4000;
  const BLINK_MS = 140;

  $effect(() => {
    const anim = animationFor(pet, animation);
    const frames = framesOf(pet, anim);
    const blink = animation === 'idle' && pet.animations.blink ? framesOf(pet, pet.animations.blink)[0] : null;

    // Reactive: the palette and settings windows can move to a monitor with another scale.
    const dpr = devicePixelRatio.current || 1;
    const px = Math.max(1, Math.round(scale * dpr));
    const size = SPRITE_SIZE * px;
    canvas.width = canvas.height = size;
    canvas.style.width = canvas.style.height = `${size / dpr}px`;
    const ctx = canvas.getContext('2d')!;
    const draw = (frame: HTMLCanvasElement) => {
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame, 0, 0, size, size);
    };

    draw(frames[0]);
    const visible = onScreen && !pageHidden;
    if (!playing || !visible || prefersReducedMotion() || (frames.length < 2 && !blink)) return;

    const start = performance.now();
    let shown = frames[0];
    let nextBlink = start + blinkDelay();
    let raf = requestAnimationFrame(function tick(now) {
      // rAF timestamps can predate `start` by a frame; clamp so we never index -1.
      const n = Math.max(0, Math.floor(((now - start) * anim.fps) / 1000));
      let frame = frames[anim.loop === false ? Math.min(n, frames.length - 1) : n % frames.length];
      if (blink && now >= nextBlink) {
        if (now < nextBlink + BLINK_MS) frame = blink;
        else nextBlink = now + blinkDelay();
      }
      if (frame !== shown) {
        draw(frame);
        shown = frame;
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

<svelte:document onvisibilitychange={() => (pageHidden = document.hidden)} />

<canvas
  bind:this={canvas}
  class="sprite"
  class:flip
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
></canvas>

<style>
  .sprite {
    display: block;
    flex: none;
    image-rendering: pixelated;
  }
  .flip {
    transform: scaleX(-1);
  }
</style>
