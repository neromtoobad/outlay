# Engine API (`Reel.define`)

Contents: page skeleton, config, states, cursor events, targets, channels and the `a` API, update functions and helpers, score and sfx, globals exposed to the renderer.

## Page skeleton

The scene is a 1920x1080 page. The engine expects these elements (the template already has them):

```html
<div id="stage">
  <div id="world">                 <!-- the camera transforms this -->
    <div id="grid"></div>          <!-- canvas texture, moves with the camera -->
    <div id="shape">               <!-- THE shape; overflow hidden -->
      <div class="content" id="c-list" data-w="640" data-h="480"> ... </div>   <!-- one per state -->
    </div>
  </div>
  <svg id="cursor"> ... </svg>     <!-- screen space, never scaled by the camera -->
</div>
<script src="reel.js"></script><script src="score.js"></script>
<script> const reel = Reel.define({ ... }); </script>
```

- A `.content` box is laid out at its state's size and centred in the shape. Everything inside is in world pixels; the camera zoom magnifies it, so a 17px label at zoom 1.6 is about 27px on screen. Design type at 14-40px and let the zoom do the rest.
- Every element the cursor targets, or that you animate from `update`, needs an `id` (ids must be unique across all states). The engine measures each id'd element once, in world coordinates with the shape centre at (0, 0).
- Two states can share one content box (`content: 'start'`), as the looping last state does.

## Config

```js
Reel.define({
  fps: 60, duration: 60, bpm: 120,
  fills: { ink: '#0a0212', paper: '#fff', accent: '#6569d2', success: '#5ecba1' }, // shape colours by name
  cursorHome: [230, 120],   // where the cursor rests at frame 0 and at the end (world px, shape centre = 0,0)
  camLean: 0.045,           // camera drifts this fraction toward the cursor, so the frame never feels locked off
  shadow: '0 0 0 1px ..., 0 24px 56px -18px rgba(...)',   // shape shadow (soft, no glow); or (S, t) => string
  springs: { size: [15, .86], radius: [15, .9], fill: [30, 1], zoomOut: 12, zoomIn: 7, cursor: [11, 1], press: 45, lean: [7, 1] },
  states: [ ... ],
  hover: ['#btn', '#row0'],  // hover tint on buttons; rows with a [data-hover-bg] child fade that child in instead
  press: ['#toggle'],        // extra elements that depress under a click (hover ones already do)
  channels: { ... },         // your own springs (sliders, toggles, holds, scrubs)
  update: { stateId(lt, S, h) { ... } },
  score: { ... },            // see score.md
  sfx(au, reel) { ... },     // scene-specific sound design
  frame(t, S, h) { ... },    // optional: runs every frame after the states (canvas colour, theme flips, overlays)
});
```

Spring pairs are `[omega (rad/s), zeta]`. Higher omega is faster; zeta 1 is critically damped (no overshoot), 0.86 overshoots about 1%.

## States

```js
{ id: 'settings', w: 580, h: 520, r: 32, fill: 'paper', zoom: 1.55, dur: 5.0,
  advance: 'click',       // default: an automatic click lands at dur-0.13 s and the next state starts at dur
  cursor: [ ...events ] }
```

- `advance: 'click'` (default) presses wherever the cursor is at the end of the state. Move the cursor onto the state's primary button about 1 s before the end, so it arrives, the button shows its hover state, then gets pressed.
- `advance: 'hold'` for a press-and-hold state: add a `hold` event that releases just before `dur`.
- `advance: 'none'` for a state that ends by itself (use sparingly). The last state is always `none`: give it `dur: null` so it fills to the end, and make it the same size, fill, zoom and content as state 0 so the loop closes.
- `fill`: a name from `fills`, or a function of the state API returning one, for a colour flip inside a state (a night-mode toggle, a success tint after a click): `fill: (a) => (a.clicked('#night') ? 'night' : 'paper')`. State 0's function is called with the API at t = 0.
- `zoom`: aim for the state to fill about 80% of 1080 in height, or about 75% of 1920 in width. Roughly `min(1500 / w, 870 / h)`.

## Cursor events (times are seconds from the state's start)

```js
['move', 0.5, target]                  // start moving to target (spring; arrives in about 0.6 s)
['click', 3.0]                         // press + release where the cursor is; the engine records what it hit
['drag', 0.9, 2.3, fromTarget, toTarget]   // press, travel from->to on a smootherstep path, release
['hold', 0.35, 1.9]                    // press and hold (drives a hold ring through a channel)
```

After a drag the cursor stays at the drop point. You don't need an extra `move`.

Targets: `[x, y]` in world px; `'#id'` (centre of the element); `{ sel: '#id', dx, dy }` (offset from centre); `{ along: '#track', f: 0.6, dy }` (a fraction across an element, for slider tracks and charts).

## Channels and the `a` API

A channel is your own spring. Its `target(a)` runs 480 times a second; return a number to set the target, or `null` to keep the previous one.

```js
channels: {
  slider: { init: 0.3, w: 40, target: (a) => (a.dragging('settings') ? a.dragFrac('#st-track') : null) },
  notify: { init: 0, w: 20, z: 0.9, target: (a) => (a.clicked('#st-tog') ? 1 : null) },
  hold:   { init: 0, w: 9, target: (a) => (a.state === 'hold' ? a.holdProgress('hold') : null) },
}
```

In the last state every channel springs back to `init`, so the loop closes. Set `reset: false` on a channel to opt out.

`hover` vs `press`: `hover` elements get an automatic background tint and depress on click. Put anything whose background is state-driven (toggles, selectable chips, segmented options) in `press` instead and colour it yourself in `update`; otherwise the hover tint overwrites your colour. Transparent elements are never tinted.

`a` provides:
- `t`, `lt` (time in state), `state` (id), `si` (index), `last`, `cursor` `{x, y}`, `pressed`, `M` (measurements).
- `dragging(stateId?)`: the active drag, or null.
- `dragFrac('#track')`: the cursor's 0..1 position across an element.
- `clicked('#id')`: whether a click has landed on that element yet. Clicks resolve to the pressable (`hover` or `press` list) under the cursor at click time.
- `clickedIn(stateId, n)`: at least n clicks in that state.
- `holding()`, `holdProgress(stateId)`: 0..1 across the hold.
- `hovering('#id')`.

Because controls read the real cursor position, the knob sits under the cursor for the whole drag. That's what makes it look like a real interaction rather than a keyframed one. Give any channel that follows the pointer a stiff spring (`w` of 100 or more). At `w: 40` a knob trails a fast drag by about 25 px, which reads as lag. Toggles and number rolls want softer springs (`w` 16-22, `z` around 0.9) so they settle with character.

## update(lt, S, h)

Called for each visible state on every rendered frame. `lt` is the time since the state started, `S` holds the frame's channel values (`S.slider`, `S.hold`, plus `S.w`, `S.zoom`, `S.cx`...), and `h` provides helpers: `h.el(id)`, `h.sp`, `h.ease`, `h.clamp`, `h.lerp`, `h.mix`, `h.rgb`, `h.setOdo(el, value, decimals, lineHeight)`, `h.hover('#id')`, `h.fill('accent')`.

Patterns (all in the template or the Stockback example):
- **Staggered reveal:** `const k = h.sp(lt - 0.3 - i * 0.14, 15, 0.9); row.style.opacity = k; row.style.transform = translateY((1-k)*10px)`.
- **Line-by-line print** (receipts, code): `clipPath: inset(0 (1-ease(k))*100% 0 0)` per line, with a thin scan bar sweeping down.
- **Draw a stroke:** give the path `pathLength="1" stroke-dasharray="1 1"`, then animate `strokeDashoffset` from 1 to 0.
- **Odometer:** `Reel.odo(el, '$0.000')` once, then `h.setOdo(el, value, 3, lineHeightPx)` each frame. The lower digits roll and carry into the higher ones.
- **Typing:** slice a string by elapsed time, with a caret that stays solid while typing and blinks at rest.
- **Number swap** (currency, units): two absolutely positioned spans crossing vertically, with `blur(k*(1-k)*16px)` at the midpoint.
- **Buttons appearing:** `opacity = sp(...)` plus `style.translate = 0 (1-k)*14px`. Use the `translate` property rather than `transform`, because the engine owns `transform` for the press.

## Globals for the renderer

`window.READY` (a promise), `window.renderFrame(f)`, `window.TOTAL_FRAMES`, `window.FPS`, `window.renderAudio()` (resolves to `{ wav: base64, peak }`), and `window.__starts` (state start times, used by QA transition strips). Open the page with `?t=12.5` to see one frame, or `?play` to watch it in real time in a browser.
