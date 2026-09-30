# Score and sound design

The music is original and synthesised, so there are no licensing questions. It's built from the reel's own timeline, so it fits the cut exactly. Music-generation tools may be unavailable or restricted to other uses, and this approach doesn't need them.

## What the default track is

- 120 BPM (matching `bpm`), one chord per bar, cycling `prog` (default F, G, Em, Am in C major: warm, forward, optimistic).
- Voices:
  - pads: detuned saws through a lowpass that opens and closes by section
  - a plucked 16th-note arpeggio of the chord tones, with a dotted-8th delay
  - bass: sine plus a quiet triangle an octave up
  - kick with sidechain ducking of pads and bass
  - offbeat hats, a clap on 2 and 4 in the "lift" sections
  - FM bells for motifs
  - a noise-and-sine riser
  - a sub boom for impacts
- The bus runs a 35 Hz high-pass, a gentle compressor (-12 dB threshold, 2.5:1), then peak-normalises. The mux step applies `loudnorm` to -16 LUFS (−1.5 dBTP), which suits social video.
- The reverb and delay tail past the end is folded onto the start, so the audio loops as cleanly as the picture.

## Sections

Sections are chosen per bar. By default:
- **intro:** the first 2 bars, soft pads and 8th plucks with no drums.
- **groove:** kick, hats, bass, plucks.
- **riser:** any bar under a hold. The hats build to 16ths, the bass pulses, the pad opens, and a riser runs until the next state.
- **lift:** everything after the first hold. It adds claps, extra hats and a brighter pluck.
- **outro:** the last 2 bars, matching the intro so the loop is seamless.
- **break:** any bars you list: `breaks: [['trap', 'safe']]` strips it back to a sparse, filtered tension under a "danger" beat, then comes back in on the resolving state.

You can also pass `sections: [[0,'intro'],[2,'groove'],[10,'riser'],[11,'lift'],[19,'break'],[22,'lift'],[28,'outro']]`, or a function of the bar.

## Shaping it for a product

```js
score: {
  prog: ['F','G','Em','Am', 'F','G','C','C', ...],      // one per bar; land the tonic (C) on the payoff bar
  chords: { Bb: { b: 46, p: [58, 62, 65, 69] } },          // add your own voicings (b = bass MIDI, p = pad MIDI)
  hits: [{ state: 'done', boom: 0.55, motif: [72, 76, 79] }, { state: 'brand', boom: 0.5, motif: [72, 76, 79, 84] }],
  breaks: [['trap', 'safe']],
  padCut: { lift: 2000 }, musicLevel: 1, sfxLevel: 0.9,
  whooshes: true, clicks: true, holdRiser: true,
}
```

- Put the tonic chord (C) on the bar where the product pays off (confirmation, brand reveal). A V chord (G, or E for tension into Am) on the bar before a big moment makes the arrival feel earned.
- Hits: a sub boom plus a rising three-note bell motif on the 2-3 most important moments. More than that and nothing stands out.
- Mood: for calmer products, drop the clap (no hold, so no lift) and lower `padCut`. For darker ones, use a minor progression (Am, F, C, G) and hit on Am.

## Sound design (`sfx(au, reel)`)

The automatic layer gives you a whoosh on every state change (rising when the shape grows, falling when it shrinks) and a tick on every press and release. For scene-specific sounds, use the hook:

```js
sfx(au, r) {
  au.typing(r.at('prompt') + 0.65, r.at('prompt') + 2.6, PROMPT_TEXT);   // a key tick per character
  au.detents('slider', 'settings', 0.05);           // a tick each time the slider crosses a 5% step
  au.detents('scrub', 'pocket', 1 / 30, 2400, 0.035, (S) => S.scrubOn > 0.5);
  au.counter(r.at('pocket') + 0.35, r.at('pocket') + 1.75, 14);   // odometer roll
  for (let i = 0; i < 4; i++) au.swipe(r.at('trap') + 2.35 + i * 0.17);   // marker redaction swipes
  au.bell(r.at('boost') + 1.2, 84, 0.05);
}
```

Available voices: `tick(t, freq, vol, len)`, `whoosh(t, up, vol, len)`, `swipe(t, vol)`, `bell(t, midi, vol)`, `boom(t, vol)`, `riser(t0, t1, vol)`, `typing`, `detents`, `counter`, plus `au.BEAT`, `au.BAR` and `au.at(stateId)`.

Keep UI sounds quiet (0.03-0.12). They should be felt under the music, not heard over it.

## Checking a mix you can't hear

Run `node qa.mjs` and read three things:

1. **Loudness range (LRA)** in `summary.txt`. If it's below about 3 LU, the mix is a wall: pads are too loud or the compressor is too hard. The Stockback reel started at 1.5 LU and was fixed to 5.6 by lowering the pads (0.05 to 0.032 per voice) and softening the compressor.
2. **`spectrum.png`.** Look for a *sustained* bright band below 40 Hz. Short flashes there at each kick and boom are expected: the kick ends at 52 Hz, the boom at 45 Hz, and a 40 Hz high-pass cleans the rest. The first Stockback mix had the bass sine an octave too low (41-55 Hz fundamentals), which ate the headroom. Phone speakers can't play it anyway. Bass fundamentals belong around 80-130 Hz, plus the 35 Hz high-pass.
3. **`wave.png`.** The sections should be visible: a quieter intro and outro, a build under the riser, the breakdown dip, and dense lift sections. If it looks like one flat block, add contrast.

Then tell the user plainly that the audio was checked by analysis, not by ear, and invite them to listen.
