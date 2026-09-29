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

**Knob = magnitude** (width, thickness, density, spread, color/hue value, blur amount) —
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
| 4 | **Tunnel Hue** value (Mode 7, lagged) / **Hue-spread** value (other modes, mainly Mode 4) | **Tunnel Hue changing rate** — 0 = frozen, unbounded log curve |
| 5 | **Ring visibility** (Modes 3/6/7, lagged) / Tron hue breathing rate (Mode 5) | **Odyssey ring speed** (bipolar, unbounded) / Tron hue value (Mode 5) |
| 6 | **Width/thickness hub**: waveform line width (Modes 0/1/2, lagged), bar width (Mode 5), Thickness (Mode 7), rings thickness (Mode 3, lagged) | Hue-spread rate (Mode 4) / bar-width rate (Mode 5) |
| 7 | **Waveform X-scale** (Modes 0/1/2, lagged, unbounded — horizontal magnify/shrink) | **Amplitude** (Modes 0/1/2/4, lagged, unbounded) / Spoke Density (Mode 7, log curve) / Diversity-spread (Mode 3, lagged) / line density (Mode 5) |
| 8 | **Blur/glow amount** (global, lagged, unbounded) | **Blur breathing rate** (global, unbounded — can reach real flashing/strobe) |

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
- **"Changing" controls** (Color Mix rate, Tunnel Hue rate): at 0 the color/hue sits exactly
  on the knob's chosen value with zero drift; above 0 it starts cycling away from that point,
  faster as the fader rises, with no ceiling.

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
