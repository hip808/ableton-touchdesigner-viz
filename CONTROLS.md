# Control reference

Everything the visuals respond to: shader uniforms, what each one does, and the exact
binding wired up in `glsl1`'s Vectors page (plus a few TD-side CHOP networks for things a
shader can't do on its own — see "Independent motion clocks" below). All expressions are
typed directly into a Vector row's Value box in TD, or into the named parameter of the CHOP
mentioned.

The definitive saved state of all of this (every node, every binding) is
[`ableton-touchdesigner-viz.toe`](ableton-touchdesigner-viz.toe) — open that directly rather
than rebuilding from `ableton_viz_setup.py`, which only builds the base audio-analysis
network and knows nothing about the MIDI/control layer described here.

## Audio-reactive uniforms (bound to the `control` CHOP, not MIDI)

| Uniform | Value expression | What it is |
|---|---|---|
| `uLevel` | `op('control')['level']` | Overall RMS energy of Ableton's master bus. |
| `uBand0`...`uBand7` | `op('control')['band0']` ... `op('control')['band7']` | 8-band spectrum (60Hz, 150Hz, 350Hz, 800Hz, 1.8kHz, 3.8kHz, 7.5kHz, 14kHz center frequencies). |
| `uBeat` | `op('control')['ramp']` | 0->1 ramp per beat from the Ableton Link CHOP (`abletonlink1`), tempo-synced to Live. |
| `uTimeSec` | `absTime.seconds` | Elapsed seconds since TD started. Used only for small always-on drifts that don't need to be jump-free — never multiplied by a live knob (see "Independent motion clocks" for why). |

`gLevel()` / `gBand(b)` in the shader multiply these by `uGain` and clamp to 0..1 — use
those, not the raw uniforms, anywhere sensitivity should track the Gain control.

## MIDI controller: MVAVE SMC-Mixer

**Physical CCs: knobs send CC 30–37, faders send CC 40–47** (confirmed via a raw MIDI
monitor) — independent, not shared. **Quirk**: TD's `midiin1` CHOP has `onebased: true`,
which adds **+1** to every raw CC number when building its channel name — physical CC30
(Knob 1) arrives in TD as channel `ch1ctrl31`, physical CC40 (Fader 1) arrives as `ch1ctrl41`,
and so on. **Every expression below already accounts for this** (Knob N reads
`ch1ctrl(30+N)`, Fader N reads `ch1ctrl(40+N)`) — if you add a new binding by hand, forgetting
the +1 makes it silently read the *previous* physical control's data instead of erroring.

The 8 physical positions are numbered 1–8. Except position 1, most positions pair a
**Fader** (base value) with a **Knob** (that value's self-oscillation rate). Rate is 0..1:
**at 0 the parameter is fully static** — nothing breathes in the background by default;
turning the knob up introduces oscillation, scaling both its speed and amount together from
zero. Three knobs (2, 5's Odyssey role, and 2's Odyssey role) break this pattern and instead
control bipolar motion directly — called out below.

### Position 1 — fixed, same in every mode

| Control | Physical CC → TD channel | Uniform | Expression |
|---|---|---|---|
| Fader 1 | 40 → `ch1ctrl41` | `uGain` | `20.0 * ((raw/127.0) ** 2.5)` — **log curve**: fine control at low gain, fast ramp only near the top |
| Knob 1 | 30 → `ch1ctrl31` | `uMode` | `int(raw / 16.0)` — mode select, 0–7, linear (mode switching shouldn't have a curve) |

### Positions 2–8 — meaning varies by mode

| Pos | Fader (CC → channel) | Knob (CC → channel) | Default meaning | Odyssey (mode 7) override |
|---|---|---|---|---|
| 2 | 41 → `ch1ctrl42` | 31 → `ch1ctrl32` | **Speed** — bipolar: center=stop, log curve, ±60 max (see below) | Also drives the spoke travel/flow pattern |
| 2 (knob only, Odyssey) | — | 31 → `ch1ctrl32` | n/a elsewhere | **Spoke rotation** — bipolar, independent of Speed: center=stationary, left=counter-clockwise, right=clockwise, log curve, ±40 max |
| 3 | 42 → `ch1ctrl43` | 32 → `ch1ctrl33` | **uColorMix** (0=mono, 1=full color), Knob=breathing rate | Same — also colors the ring/streaks |
| 4 | 43 → `ch1ctrl44` | 33 → `ch1ctrl34` | **Tunnel Hue** (`uTunHueBase`), Knob=breathing rate | only meaningful in mode 7 |
| 5 | 44 → `ch1ctrl45` | 34 → `ch1ctrl35` | **Tron HueBase** (`uHueBase`), Knob=breathing rate | Fader 5 also = **Ring visibility** (`uTunRingAmount`, 0=fully vanished/stopped) |
| 5 (knob only, Odyssey) | — | 34 → `ch1ctrl35` | n/a elsewhere | **Ring inward/outward speed** — bipolar, independent: center=stationary, right=expand outward, left=contract inward, log curve, ±40 max |
| 6 | 45 → `ch1ctrl46` | 35 → `ch1ctrl36` | **Smooth** — audio lag time (TD-side, not a shader uniform), Knob=breathing rate | Smooth keeps running regardless of mode; Fader 6 also feeds `uHueSpreadBase` in mode 4 (Chromatic Bars) |
| 7 | 46 → `ch1ctrl47` | 36 → `ch1ctrl37` | **uWaveSize** (amplitude, modes 0/1/2/4), Knob=breathing rate | **Spoke Density** — octave-doubling scheme, log curve (see below), *not* a breathing rate |
| 8 | 47 → `ch1ctrl48` | 37 → `ch1ctrl38` | **uLineWidth** (global thickness), Knob=breathing rate | mode 5 (Tron): `uBarWidth`. mode 7: **Thickness** (`uTunThicknessBase`, plain value, not oscillating) |

Positions 2 and 5's knobs do **double duty**: in every mode except Odyssey they're a
breathing-rate knob (`uWaveSpeedRate`-style); the moment you're in mode 7 they instead
directly drive bipolar motion (rotation / ring speed) via an independent TD-side clock. Both
roles read the *same* physical knob — harmless, since only one shader code path is ever
active at a time.

### Independent motion clocks (TD-side Speed CHOPs, not shader math)

A shader has no memory between frames, so anything that needs to move continuously without
jumping when you touch a knob live is built as a small TD network: a Constant CHOP computes
the instantaneous *rate* from a knob/fader, feeding a Speed CHOP (`order=First`) that
integrates it into an ever-changing phase — changing the rate only affects the future
accumulation, never causes a retroactive jump. Four independent clocks exist:

| Clock | Nodes | Driven by | Feeds |
|---|---|---|---|
| **Global speed / wp()** | `speed_curve` → `wavespeed_accum` | Fader 2 (bipolar, log curve, see below) | `uWavePhase` — spoke travel/flow, most other modes' animation |
| **Ring growth / ringWp()** | `ring_rate` → `ring_phase_accum` | Knob 5 in Odyssey (bipolar, log curve) | `uRingPhaseRaw` — ring radius travel + its own slow rotation |
| **Spoke rotation / rotWp()** | `spoke_rot_rate` → `spoke_rot_accum` | Knob 2 in Odyssey (bipolar, log curve) | `uSpokeRotRaw` — spoke pattern's angular offset |
| **Stroke intensity envelope** | `stroke_level_calc` → `stroke_intensity_lag` | Gain × live level | `uStrokeIntensity` — fast-attack/slow-release brightness pop on the spokes |

**Fader 2 / Speed** (`speed_curve`'s expression):
```python
math.copysign(60.0 * abs((op('/ableton_viz/midi_lag')['ch1ctrl42'] - 63.5)/63.5) ** 2.5,
              op('/ableton_viz/midi_lag')['ch1ctrl42'] - 63.5)
```
Center (raw 63.5) = 0 (stopped). Bipolar, log curve (power 2.5) for fine control near the
stop point. Max magnitude ±60 in either direction. `uWavePhase` reads
`op('/ableton_viz/wavespeed_accum')['speed']`.

**Knob 5 in Odyssey / Ring speed** (`ring_rate`'s expression):
```python
math.copysign(40.0 * abs((op('/ableton_viz/midi_lag')['ch1ctrl35'] - 63.5)/63.5) ** 2.5,
              op('/ableton_viz/midi_lag')['ch1ctrl35'] - 63.5)
```
Same shape as Speed: center=stop, bipolar, log curve, max ±40. Positive = ring travels
outward (grows); negative = ring travels inward (shrinks toward center — and the "dissolve"
naturally reads as *condensing into solid* instead of dissolving, since the effect is keyed
to radius/phase, not direction).

**Knob 2 in Odyssey / Spoke rotation** (`spoke_rot_rate`'s expression):
```python
-1.0 * math.copysign(abs((op('/ableton_viz/midi_lag')['ch1ctrl32'] - 63.5)/63.5) ** 2.5,
                      op('/ableton_viz/midi_lag')['ch1ctrl32'] - 63.5) * 40.0
```
Center=stationary, left=counter-clockwise, right=clockwise, log curve, max ±40 rad/sec
(fast enough at the extremes to blur into a smooth spin).

**Stroke intensity envelope** (`stroke_level_calc`'s expression, feeding `stroke_intensity_lag`):
```python
min(op('control')['level'] * (20.0 * ((op('/ableton_viz/midiin1')['ch1ctrl41'] or 0) / 127.0) ** 2.5), 3.0)
```
Same gain curve as `uGain` applied to live level, capped at 3.0 (not 1.0) for extra punch on
peaks. `stroke_intensity_lag` has **lag1 (attack) = 0.05s, lag2 (release) = 1.4s** — pops up
fast on a hit, eases back down slowly for an organic feel, rather than snapping.

**Smooth** (`lag1.par.lag1`/`lag2` expression, Position 6, TD-side):
```python
(1.0 - op('/ableton_viz/midiin1')['ch1ctrl46']/127.0) * 1.5 *
(1.0 + math.sin(absTime.seconds * (op('/ableton_viz/midiin1')['ch1ctrl36']/127.0)*3.0) * 0.3 *
 (op('/ableton_viz/midiin1')['ch1ctrl36']/127.0))
```
Min fader = 1.5s lag (slow/drifting), max fader = 0s (instant/snappy); Knob 6 adds a
breathing wobble on top, same zero-at-rest rule as everywhere else.

### Odyssey (mode 7) spoke density — octave doubling, not a simple rescale

Directly rescaling spoke *count* used to reposition every spoke as density changed, reading
as the whole pattern spiraling. Fixed via octave doubling in `sceneTunnel`: existing spokes
never move; each doubling fades in a second copy of the current spoke count, phase-shifted
by exactly half a sector (i.e. sitting at the exact midpoints between existing spokes), so
new lines genuinely grow in between rather than the pattern rearranging itself.

```glsl
float densityCurved = pow(clamp(uTunDensityBase, 0.0, 1.0), 2.5);  // log curve
float levelProgress = densityCurved * 6.0;   // 6 doublings available
float levelInt = floor(levelProgress);
float levelFrac = fract(levelProgress);      // 0..1 fade-in of the new interleaved spokes
float segOld = 4.0 * pow(2.0, levelInt);     // base 4 spokes, doubling each level
```
Range: 4 → 8 → 16 → 32 → 64 → 128 → 256 spokes across the fader's travel — sparse to fully
filled-in dense.

### Odyssey ring — travel, dissolve, and kick pulse

The ring is a single continuously-traveling pulse (not audio-level-sized): its radius comes
from `ringPhase = fract(ringWp())`, mapped `0 → 1.9` (well past the frame edge — genuinely
leaves the screen). It **dissolves into smoke starting immediately, fully dissolved by
halfway** through the travel (`dissolveT = smoothstep(0.0, 0.5, ringPhase)`), widening from a
crisp line into a diffuse glow and fading opacity to 0 as it goes — which also conveniently
hides the loop's reset back to phase 0. `uTunRingAmount` (Fader 5) is pure visibility: 0
fully vanishes and stops it outright, independent of gain. A radial waveform wobble (8
gain-scaled harmonics of angle, seamless around the full circle) rides on top and rotates
slowly via `ringWp() * 0.6` — proportional to the ring's own growth speed, not the global
Speed.

The **whole Odyssey scene** (spokes, ring, core, everything) gets one more multiplier at the
very end of `sceneTunnel`:
```glsl
float kickPulse = 1.0 + bands[0] * 2.0;  // band0 = the kick/~60Hz band, already gain-scaled
col *= kickPulse;
```
So Fader 1/Gain directly controls how hard the whole scene punches on the kick.

### Odyssey parameters with no live control

Twist was removed entirely (spokes no longer rotate on their own — only Knob 2's independent
rotation does that now). Three tunnel parameters are fixed at constants with zero
oscillation, since there weren't enough physical positions left to cover all 8 original
concepts:

| Uniform | Value |
|---|---|
| `uTunPulseBase` / `uTunPulseRate` | `0.5` / `0.0` |
| `uTunGlowBase` / `uTunGlowRate` | `0.6` / `0.0` |

(`uTunTwistBase` and `uTunRingBand` were both deleted from the shader entirely — dead code
from earlier iterations of the ring/spoke design.)

## `uMode` — the 8 visual modes

| Value | Name | Description |
|---|---|---|
| 0 | Waveform | Single oscilloscope trace, built from 8 summed sine waves (one per band). Color cycles slowly and continuously regardless of other knobs. |
| 1 | Multi-wave | 14 overlapping traces sharing one center line — dense EEG/tangle look, each trace a different hue. |
| 2 | Aurora | Near-black background with a big waveform silhouette rendered as a glowing neon edge outline (not a solid fill), plus 4 thin colored traces on top, all hue-shiftable via `uColorMix`. |
| 3 | Raster bars (ring) | 8 hard-edged vertical bars (classic Ikeda test-pattern), scanlines, crosshair, plus a beat-synced expanding ring. |
| 4 | Chromatic bars | 32 densely-packed rainbow bars with a soft glow halo, over a drifting rainbow-striped background. Hue spread across bars adjustable (position 6) from "all bars share one evolving hue" to full spread. |
| 5 | Tron equalizer | 8 mirrored, glowing LED-style bars on plain black, growing outward from the vertical center, with a gentle per-band traveling wave riding on top. Solid full-brightness core (no dim-when-thin), soft blur only at the top/bottom tips. Subdivided into evenly-spaced lines (`uLineDensity`). |
| 6 | Moiré | Two overlapping line grids at a slowly rotating relative angle, interference fringes. |
| 7 | Odyssey (Tunnel) | 2001-style light-speed tunnel: laser-thin radiating streaks (independently rotatable), a single traveling/dissolving ring (independently growable/shrinkable), a bright vanishing-point core, all kick-reactive. |
| other | Fallback | Plain raster bars, no ring — same look as mode 3 minus the ring, used for any out-of-range `uMode` value. |

**Deleted:** the old "Polar burst" mode (radial version of the raster bars) was removed
entirely — no uniform or scene function for it remains.

## Global helpers all modes share

- `gLevel()` / `gBand(b)` — `uLevel`/`uBandN` multiplied by `uGain` and clamped to 0-1.
- `tint(hue)` — white at `uColorMix`=0, full-saturation hue at 1, self-oscillating via `uColorMixRate`.
- `hueBase()` — Tron only: `uHueBase`, self-oscillating via `uHueBaseRate`.
- `wp()` — `uWavePhase` wrapped to a bounded range for float precision. Use this (never raw `uWavePhase`) for anything that should animate with Speed.
- `ringWp()` / `rotWp()` — same wrapping idea, but each reads its own independent uniform (`uRingPhaseRaw` / `uSpokeRotRaw`) — completely decoupled from `wp()`/Fader 2.
- `oscParam(base01, rate01, lo, hi, wobbleFrac)` — base+rate self-oscillation helper. `rate01 == 0` is always fully static.
- `breathe(value, rate01)` — same idea, multiplicative, for uniforms already pre-scaled to their real range (`uWaveSize`, `uLineWidth`, `uBarWidth`).
- `hLine()` / `gridLine()` / `neonFalloff()` — solid full-brightness line cores (no soft glow halo) so thin lines never look dim; width floored to ~1 screen pixel of AA.

## Ideas for what's left

- **Buttons -> direct mode select**: one button per mode (0-7) instead of sweeping the mode knob — needs a small Switch/Logic CHOP to pick "last button pressed."
- Two previously-seen unidentified channels, `ch1ctrl53`/`ch1ctrl54`, are still unbound.
- Odyssey's Pulse/Glow could get live controls if you're willing to give up something else's control to free a position.
