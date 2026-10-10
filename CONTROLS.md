# Control reference

Everything the visuals respond to, organized around how you actually play it live. The
definitive saved state is [`ableton-touchdesigner-viz.toe`](ableton-touchdesigner-viz.toe) —
open that directly; `ableton_viz_setup.py` only builds the base audio-analysis network and
knows nothing about the MIDI/control layer described here.

## MIDI controller: MVAVE SMC-Mixer

**Physical CCs: knobs send CC 30–37, faders send CC 40–47.** TD's `midiin1` CHOP has
`onebased: true`, which adds **+1** to every raw CC number when building its channel name —
physical CC30 (Knob 1) arrives as `ch1ctrl31`, physical CC40 (Fader 1) arrives as `ch1ctrl41`,
and so on (Knob N → `ch1ctrl(30+N)`, Fader N → `ch1ctrl(40+N)`).

## Design rule

**Knob = magnitude** (thickness, density, spread, color/hue value, blur amount) —
things you judge by looking at the screen, not the knob position. **Fader = rate/time**
(speed, rotation rate, changing/breathing rate) — things you judge by the fader's height at
a glance. Three deliberate exceptions: Gain (fader, standard audio-gear convention), Mode
select (knob, discrete), and Rotation (knob, because "spin the knob to spin the pattern" is
too natural a gesture to give up even though rotation is technically a rate).

## Position 1 — fixed, same in every mode

| Control | CC → Channel | Function |
|---|---|---|
| Knob 1 | 30 → `ch1ctrl31` | **Mode select** (0–7), linear |
| Fader 1 | 40 → `ch1ctrl41` | **Gain** — log curve, `20 * (raw/127)^2.5` |

## Positions 2–8

| Pos | Knob (magnitude) | Fader (rate) |
|---|---|---|
| 2 | **Rotation** *(exception)*: Mode 3 rings-orbit, Mode 6 pattern rotation, Mode 7 spoke rotation (motion-blurred, see below) | **Speed**: default in most modes; Mode 3 override = ring/shape growth rate |
| 3 | **Color Mix** — picks the hue (sweeps the color wheel), lagged | **Color changing rate** — 0 = frozen on Knob 3's color, unbounded log curve above 0 |
| 4 | **Tunnel Hue** value — layered as an additive hue offset in *every* mode (on top of whatever each mode already does for color: Color Mix in 0/1/2/6, index rainbow in 3, hue-spread in 4, Tron hue in 5, native role in 7), plus its original **Hue-spread** value role in Mode 4 specifically | **Tunnel Hue changing rate** — 0 = frozen, unbounded log curve, same "applies everywhere" scope as the value |
| 5 | **Ring visibility** — the shared traveling ring is now drawn as an overlay in *every* mode (0/1/2/3/4/5/6/7), lagged. The 8 scattered rings in Mode 3 are a separate thing and always fully visible regardless of Knob 5. Mode 5 also keeps Knob 5's original Tron hue breathing rate role — **reverted to plain linear** (`raw/127`, bounded 0..1), not the log/unbounded family | **Ring speed** — likewise now drives the shared ring's travel speed in every mode (bipolar, unbounded in mode 7's own use, bounded ±40 as the base mechanism elsewhere). Mode 5 also keeps Fader 5's original Tron hue value role |
| 6 | **Thickness hub**: waveform line thickness (Modes 0/1/2, lagged), bar thickness (Mode 5), tunnel thickness (Mode 7), ring thickness (Mode 3, lagged). Waveform thickness's curve (Knob 6) is now **flat/linear through ~98% of the travel** (0 to 15), with unbounded divergence compressed into just the last handful of raw MIDI values at the very top — a true constant-slope linear curve can't become unbounded at a finite knob position, so this trades a barely-there acceleration right at the physical max for a linear feel everywhere else | Hue-spread rate (Mode 4) / bar-thickness rate (Mode 5) / ring-thickness rate (Mode 3) / **shared thickness-breathing rate, unbounded log curve** — waveform thickness (Modes 0/1/2, previously had no rate at all) and tunnel thickness (Mode 7, previously static) now breathe too. *(Modes 4 and 6 were intentionally left with fixed/uncontrolled width — not part of this pass.)* |
| 7 | **Waveform X-scale** (Modes 0/1/2, lagged, unbounded — horizontal magnify/shrink) / **ring radius scale** (Mode 3, lagged) | **Amplitude** (Modes 0/1/2/4, lagged, unbounded) / Spoke Density (Mode 7, log curve) / Diversity-spread (Mode 3, lagged, unbounded) / line density (Mode 5) |
| 8 | **Blur/glow amount** (global, lagged, unbounded — also adds a soft glow halo to Mode 3's scattered rings) | **Blur breathing rate** (global, unbounded — can reach real flashing/strobe; also the rate for Mode 3's ring glow) |

## Modes

| # | Name | Notes |
|---|---|---|
| 0 | Waveform | Single oscilloscope trace |
| 1 | Multi-wave | 14 overlapping traces |
| 2 | Aurora | Tron-style silhouette + traces |
| 3 | Raster Bars | Shared central ring + 8 scattered dissolving rings |
| 4 | Chromatic Bars | Dense rainbow bar chart |
| 5 | Tron EQ | Neon bar equalizer |
| 6 | Moiré | Interference grids + shared ring |
| 7 | Odyssey | Tunnel/hyperspace: spokes, shared ring, center core |

## Response lag

Fixed at a **constant 1.07s** — no longer live-controlled (it used to live on Knob 2, but
that's now dedicated purely to rotation). Every control marked "lagged" above smooths at
this fixed rate. If you want it adjustable again, it needs a new home — ask and it can be
wired to a free control.

## Curve types, in plain terms

- **Log/unbounded** (`t^k / (1-t)` family, `t = raw/127` or similar): fine control through
  most of the travel, diverging sharply only in the last stretch — used for anything marked
  "unbounded" above (Speed, Amplitude, X-scale, blur amount/rate, hue-changing rate, ring
  speed, rotation rate). None of these have a hard ceiling; pushed far enough they reach
  extreme values (fast strobing, huge scale, etc.) by design.
- **Bipolar** (Speed, ring speed, rotation, mode-3 growth/orbit): center of the fader/knob =
  stopped; one side = one direction, the other = the opposite. Speed (Fader 2) has a small
  dead-zone right at center (raw within ~8% of center snaps to exactly 0) so it reliably
  freezes instead of drifting from controller noise.
- **"Changing"/breathing rate controls** (Color Mix rate, Tunnel Hue rate, rings-thickness
  rate, blur breathing rate, Tron hue rate, hue-spread rate, bar-width rate, line-density
  rate): at 0 the value sits exactly on the knob's chosen base with zero drift; above 0 it
  starts cycling away from that point, faster as the fader rises, with no ceiling. All of
  these now share the same log curve (exp 2.5) and the same jump-free mechanism: each has
  its own dedicated accumulator clock, completely independent of Fader 2/Speed and of each
  other, so moving one rate control never causes a sudden visual jump in that effect (the
  old approach multiplied a large ever-growing clock by the live rate, which jumped the
  phase every time the fader moved).

## F1 (Gain) vs F7 (Amplitude) — why both exist

These look redundant (both "make the reactive visual bigger") but they act on two different
stages of the pipeline and solve two different problems:

- **F1/Gain is input-side sensitivity.** It rescales the *raw* incoming audio (band/level
  values, often tiny — 0.01–0.1 from a real mix) up into a usable 0–1 range before anything
  else touches it: `gLevel() = clamp(uLevel * uGain, 0, 1)`, `gBand(b) = clamp(b * uGain, 0, 1)`.
  Same role in Mode 4's 3D mesh simulation (`height_script1`): gain scales each raw band value
  before it's allowed to inject energy into the wave physics.
- **F7/Amplitude is output-side visual scale.** It's applied *after* gain, to the
  already-normalized, already-reactive result — it only controls how big the resulting shape
  is drawn (`uWaveSize` in the 2D traces; `amplitude` multiplying final wave height in the 3D
  mesh). It does not change how responsive the visual is to the music's dynamics, only how
  large the already-responsive result appears.

In practice: if F1 is too low, quiet passages barely move the visual at all, no matter how
high F7 is. If F1 is too high, everything slams to the clamp ceiling and stops being
dynamic — loud and quiet parts look identical, no matter how low F7 is. F7 never fixes an
unresponsive signal; it only resizes whatever F1 already let through. Not redundant — they're
answering "can it hear the music correctly" (F1) vs. "how big do I want to draw what it
heard" (F7).

## K3 (Color Mix) vs K4 (Tunnel Hue) — why both exist

Same question as F1/F7, different mechanism. These look redundant (both "shift the color")
but K3 alone structurally cannot reach every color at full saturation — K4 is the one thing
that fixes that, not a duplicate control.

**Root cause:** in the 3D mesh's color formula (and in any 2D-mode usage that calls
`tint(colorHue())` with its own hue argument), K3's single value is reused for two different
jobs at once — it's both the hue-wheel position *and* the white↔color blend amount (`cm`).
Concretely: `color = mix(white, hsv(hue, 1, 1), cm)`, and when `hue == cm == K3`, saturation
ends up tied to *distance from red*. Verified numerically:

| K3 position | Nominal hue | What you actually see |
|---|---|---|
| 0.33 | green | pale washed-out mint (only 33% saturated) |
| 0.66 | blue | pale dusty lavender (only 66% saturated) |
| 1.0 (wraps) | red | the *only* point reaching full, vivid saturation |

So turning K3 alone sweeps the hue wheel, but only the red wraparound point ever looks truly
vivid — every other hue is forced pastel in proportion to how far it sits from red.

**Why K4 fixes it:** K4's tunnel-hue is *added* to the final hue used for display but is
**not** part of the saturation calculation (`final_hue = cm + tunnel_hue`, saturation only
ever depends on `cm`). So you can push K3 up near max (maxing out saturation, landing near
red) and then use K4 to dial the displayed hue to anywhere else on the wheel — any hue, full
saturation — something K3 alone cannot do.

**Conclusion:** K3+K4 is a necessary pair, not a redundant one, as long as the "white at
minimum" blend behavior (explicitly requested) stays tied to K3's own value. A redesign
where K3 alone reaches full saturation at every hue is possible (split the single knob's
travel into a fast white→saturated ramp over roughly the first 15%, then a full-wheel hue
sweep at locked full saturation for the rest) but was intentionally **not implemented** —
decided to keep K3+K4 as-is for now.

**Mode 7 (Odyssey) exception:** K4/F4 also has a "native" structural role there (not just
color) distinct from tunnel-hue's decorative use in every other mode — another reason not to
collapse it away as "just" a color control.

## Mode 4's 3D mesh — control overrides

The 3D wireframe water-plane mesh (`grid3d`) has its own dedicated roles for several
positions, layered on top of (or replacing) the general table above:

- **Knob 2 / Fader 2 — rotation/tumble.** True axis-angle tumbling (`tumble_script1`): Knob 2
  is wobble amount (how far the spin axis itself precesses off a clean single-axis spin),
  Fader 2 drives spin speed via the shared `rotx_accum` clock. This is the *only* thing that
  moves the mesh as a whole — density and the wave physics never do (see below).
- **Knob 5 — mesh density**, not Ring visibility: live grid resolution from 2×2 up to
  120×120 cells (`meshgrid1` cols/rows). Below ~8×8 the grid is too coarse to show real
  ripple structure and the whole mesh reads as swinging/tilting rather than rippling — that's
  a hard geometric floor (4 corner points can't encode localized bumps), not a tunable bug.
  Wave footprint size (`INJECT_RADIUS`/`INJECT_SIGMA`) and smoothing passes scale with density
  so the wave's look stays constant in world units regardless of where Knob 5 sits.
- **Knob 3 (Color Mix) / Fader 3, Knob 4 (Tunnel Hue) / Fader 4 — unchanged**, still set the
  mesh's base color exactly as in the general table.
- **Fader 5 — rainbow spread + speed** (new, `color_script1`/`color_to_sop1`, replaces Ring
  speed for this mesh only). At F5=0 the mesh is a single uniform color (identical to K3/K4's
  base hue, so the look is unchanged from before this control existed). Turning F5 up spreads
  that base hue out into a full rainbow gradient across the mesh (diagonal by grid row+col)
  *and* speeds up how fast that gradient scrolls — both driven by the same raw fader value so
  they scale together. F5=0 freezes the scroll, matching every other "changing rate" control's
  zero-drift convention. Implemented as a per-point `Cd` color attribute (a `color_script1`
  scriptCHOP feeding a `color_to_sop1` chopToSOP), with `wiremat1`'s own constant color set to
  white so it passes the per-point color through unmodified. K3's white↔color blend (`cm`,
  see "K3 vs K4" above) still applies to every point here too, not just the single base
  color — K3 fades the whole rainbow toward white at K3=min, same as before this control
  existed.

## Known quirks worth knowing

- **Mode 7 spoke rotation has motion blur**: at high rotation speed, a single-instant sample
  per frame aliases into an apparent reverse spin (wagon-wheel effect). The shader averages
  6 samples across a simulated 1/60s exposure window to fix this — it reads as a smear/streak
  at extreme speed rather than a strobe.
- **Mode 7's Speed (Fader 2) flow direction is intentionally reversed** relative to every
  other mode's use of the same Speed control — flipped only in that one calculation, so it
  doesn't affect Speed anywhere else.
- **F7 keeps 4 roles at once** (Amplitude, Spoke Density, Diversity, line density) because
  they're all mode-exclusive — only one is ever active depending on which mode you're in.
- **Unbounded curves can outrun what's visible.** Pushed near the very top of travel, a
  control's underlying value can already be enormous (e.g. amplitude in the thousands) while
  looking visually identical to a slightly-lower setting, because the visual result has
  already saturated (off-screen, fully stretched flat, etc.) — that's expected, not a fault
  in the knob/fader response.
