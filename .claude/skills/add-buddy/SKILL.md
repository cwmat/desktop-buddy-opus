---
name: add-buddy
description: Add a new pixel-art buddy (pet) to Desktop Buddy, or redraw an existing one. Use when asked to create, design, animate, or tweak a pet/buddy/sprite.
---

# Add a buddy

Buddies are plain TypeScript data: 32×32 text-grid frames + a palette + personality. Nothing else in the app needs to change.

## Steps

1. **Pick an id** (kebab-case, stable forever — it keys saved stats) and create `src/pets/<id>.ts` default-exporting a `PetDefinition` (see `src/pets/types.ts`). Use an existing buddy such as `src/pets/glorp.ts` as the template.
2. **Register it** in `src/pets/index.ts` (`PETS` array; order = gallery order).
3. **Draw the frames** with the helpers in `src/pets/sprite.ts`:
   - `sprite(\`...\`)` parses a 32-row block (indentation ignored, `.` = transparent).
   - Draw one base pose, then derive variants: `patch(base, x, y, rows)` stamps a small region (`.` keeps the base, `_` erases), `shift(f, dx, dy)` nudges, `recolor(f, {a: 'b'})` swaps palette keys, `flipX` mirrors.
   - Required animations: `idle`, `walk`, `sleep`, `happy`, `eat`, `drag`. Optional: `blink` (1 frame), `fall`, `sit`.
   - **All frames face right** (the renderer mirrors). Feet touch the bottom row (row 31).
4. **Preview and iterate** — don't skip this; text grids lie:
   ```bash
   pnpm pets:preview <id>
   ```
   Then open `previews/<id>.png` (one row per animation, dark and light backgrounds side by side) and `previews/roster.png` (after a full `pnpm pets:preview`) to compare with the other buddies at small size.
5. **Validate**: `pnpm test` runs `validatePet` on every buddy (row lengths, palette keys, required animations, lines, personality 1–10).

## Art rules that keep the roster cohesive

- 1px outline in a dark shade of the body hue (not pure black) — it has to read on dark *and* light desktops.
- 3–4 tone ramp per material, light from the top-left, ≤ 12 colours, no stray pixels.
- Big eyes with a 1px catchlight. Silhouette must be recognisable at 1×.
- Motion should express personality (waddle, jiggle, glide, trundle…). Don't draw Z's, treats or hearts — the renderer adds effects.
- Lines are short (≤ ~40 chars), wholesome, original, lightly nerdy.

## Traits

- `traits.hover: true` floats the buddy above the ground (ghosts).
- `traits.speed` multiplies walk speed (1 = normal).
