# Craft: what makes the reel look expensive

These rules came from building and critiquing a real 60 s reel frame by frame. Each has a reason; keep the reason in mind when a new product tempts you to bend a rule.

## Story before pixels

- Use 10-14 states for 60 s. Each state is one idea a viewer can read in 3-6 s: input → the smart step → the user's control → the commitment (hold) → proof (confirmation) → payoff (numbers) → trust (safety, under the hood) → business (how it earns) → brand lockup.
- The lockup's call-to-action button is the loop point. Clicking it collapses the whole shape into the very first state, so the loop reads as intentional.
- Use real content: the product's real copy, real numbers, real logos, a real transaction hash. Placeholder lorem reads as a template instantly.
- One accent word per headline in the display face (for example "Who *profits*", "Injection *ignored*"). Don't italicise whole sentences.

## The shape

- It's one element, and it never cuts or cross-fades. It changes width, height, radius and fill, and content swaps inside it with a short blur: about 0.11 s out, then in from 0.1 s after the switch.
- Alternate light and dark states (paper → ink → paper → accent → success) so every transition has visible energy. Two paper states in a row need a big size change to feel like a move.
- **Colour springs must be fast** (omega 30, critically damped). At omega 12, a white→black morph sat mid-grey for 0.3 s and looked muddy. At 30 it passes through grey in about 2 frames.
- Radius tracks the shape (pill → card → circle); clamp it to half the smaller side. The engine does this.
- Keep shadows soft and tinted to the palette, with a 1px hairline. No glow.

## The camera

- Zoom so each state fills about 80% of the frame. The camera doesn't pan; it leans slightly toward the cursor (4.5% of the cursor's offset), which is enough to feel hand-held.
- **Make the zoom asymmetric.** When the shape grows, the camera must pull out quickly (omega 12), or the card spills off the frame for 0.3 s. When the shape shrinks, push in gently (omega 7): it reads as a deliberate push-in.
- Keep text crisp: don't set `will-change` on the world or shape (Chrome would scale a cached bitmap), and render at 1x device scale. Every frame is re-rasterised at its own zoom.

## The cursor

- Show a real arrow cursor (black with a white keyline), in screen space so it never scales with the camera.
- **Every change is caused:** a click on a button, a drag on a control, a press-and-hold. A state that advances by itself breaks the illusion.
- Choreograph it like a person: glance across rows while they reveal (hover highlights follow), travel to the button about 1 s before the click so the hover state reads, then press. On press the cursor shrinks 10% and the target depresses 4% (the whole shape depresses 2.8% if you click the shape itself).
- For drags, the control reads the cursor's actual position, so knobs, scrub lines and tooltips are glued to the pointer.
- The cursor path is a spring toward each new target: fast start, soft landing. Don't add arcs or overshoot.

## Timing and rhythm

- Use a beat grid (120 BPM → 0.5 s beats, 2 s bars). State lengths are multiples of 0.5 s and big moments sit on bar lines, which is what lets the music hit the cuts.
- No dead time: inside a state, something reveals, counts, draws or responds at every moment. If the cursor waits more than about 1 s, tighten the state or give the cursor something to hover.
- Stagger reveals at 0.12-0.2 s per item, springs at omega 15-17, zeta 0.84-0.9 for chips and numbers (a hint of overshoot reads as life), zeta 1 for text.

## The loop

- The last state duplicates state 0 (size, fill, zoom, content) and the cursor returns to `cursorHome`.
- Two traps the engine now handles; know them in case you write your own:
  1. The camera lean has its own resting point (lean × cursor home). Start the camera there, not at 0, or frame 0 isn't at rest and the loop jumps.
  2. The springs need about 1.5 s to fully settle, so the engine pins the last 0.4 s onto frame 0's values.
- QA checks the raw seam: SSIM 1.000000 between the rendered frames 0 and N-1. After H.264, expect about 0.99, which is only compression (keyframe versus predicted frame).

## Colour and type

- Use the product's palette. If none is given, use a restrained set: a canvas tint, ink, paper, one brand accent, one success colour, one warning colour. Fill states only from that set.
- Use a flat canvas with a faint dot grid in world space. The dots are the only cue that the camera is moving, so keep them subtle.
- Use one UI font and tabular numerals for anything that counts. Use Geist Mono (or the product's mono) for receipts, hashes and data.
- Draw icons from one set with one stroke weight. Mixing outline sets is the fastest way to look cheap.

## Bugs already met (don't repeat them)

- **A hover tint that resets toggles:** a generic hover routine that set `background = ''` every frame wiped the toggle's "on" colour. Only apply hover tints to the `hover` list; controls own their own colours.
- **Odometer overflow:** a template with too few digit columns shows 2.5 for 12.5. Size the template for the largest value.
- **SVG presentation attributes don't resolve CSS variables:** `stroke="var(--x)"` fails. Use `style="stroke:var(--x)"`.
- **Measurements assume layout at rest:** don't measure elements you transform (scale or translate) in `update`. Measure their static wrappers, or give the cursor offsets from a static element.
- **Theme flips mid-reel** (day → night, dark mode): drive the shape with a `fill` function and the canvas, dots and shadow from the `frame` hook, all off one spring channel, so everything crossfades together.
- **Real media in content:** put product images (pets, screenshots, logos) in the reel folder and reference them relatively. The engine waits for every `<img>` to load before measuring.
- **Headless Chrome screenshots at 390px wide are not a phone:** window sizes have a minimum. For phone framing, lay the scene out at 1080x1920 instead (change `size` and the CSS page size).
