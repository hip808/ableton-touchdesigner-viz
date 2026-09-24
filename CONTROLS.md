# Control reference

Everything the visuals respond to: shader uniforms, what each one does, and the exact
MIDI binding currently wired up in `glsl1`'s Vectors page. All expressions below are typed
directly into a Vector row's first Value box in TD (Name = the uniform name, Value = the
expression).

The definitive saved state of all of this (network wiring, every binding) is
[`ableton-touchdesigner-viz.toe`](ableton-touchdesigner-viz.toe) — open that directly rather
than rebuilding from `ableton_viz_setup.py`, which only builds the base audio-analysis
network and knows nothing about the MIDI layer described here.

## Audio-reactive uniforms (bound to the `control` CHOP, not MIDI)

| Uniform | Value expression | What it is |
|---|---|---|
| `uLevel` | `op('control')['level']` | Overall RMS energy of Ableton's master bus, smoothed through `lag1`. |
| `uBand0`...`uBand7` | `op('control')['band0']` ... `op('control')['band7']` | 8-band spectrum (60Hz, 150Hz, 350Hz, 800Hz, 1.8kHz, 3.8kHz, 7.5kHz, 14kHz center frequencies), same smoothing. |
| `uBeat` | `op('control')['ramp']` | 0->1 ramp per beat from the Ableton Link CHOP (`abletonlink1`), tempo-synced to Live. |
| `uTimeSec` | `absTime.seconds` | Elapsed seconds since TD started. GLSL TOP has no built-in time uniform (see NOTES.md) — used only for small always-on drifts, never multiplied by a live knob (see `uWavePhase` below for why). |

## MIDI-controlled uniforms (MVAVE SMC-Mixer, Bluetooth, device ID 1 in `midiin1`)

Each knob and the fader in the same channel strip **share the same MIDI CC** on this
device (confirmed for channels 3, 4, and 5) — so a binding to e.g. `ch1ctrl43` responds to
either the knob or the fader in that strip, not just one of them.

| Knob/Fader | MIDI channel | Uniform(s) | Value expression | Range / feel |
|---|---|---|---|---|
| 1 | `ch1ctrl41` | `uGain` | `op('/ableton_viz/midiin1')['ch1ctrl41'] / 127.0 * 20.0` | Sensitivity multiplier on `uLevel`/`uBand0-7`. 0 = flat, ~20 = fully saturated/spiky. |
| 2 | `ch1ctrl42` | `uMode` | `int(op('/ableton_viz/midiin1')['ch1ctrl42'] / 16.0)` | Selects one of 8 visual modes, 0-7 (see table below). |
| 3 | `ch1ctrl43` | `uColorMix` | `op('/ableton_viz/midiin1')['ch1ctrl43'] / 127.0` | 0 = monochrome white/cyan, 1 = full color cycling. |
| 4 | `ch1ctrl44` | *(drives `lag1`, not a uniform — see below)* | — | Audio smoothing time. **Reversed**: min = slow/smooth, max = fast/snappy. |
| 5 | `ch1ctrl45` | `uLineDensity` **+** *(feeds `uWavePhase` via a CHOP chain — see below)* | `op('/ableton_viz/midiin1')['ch1ctrl45'] / 127.0` | Mode 5 only: how many evenly-spaced lines subdivide each equalizer bar (1-14). Also drives animation speed everywhere else (no conflict — mode 5 doesn't animate). |
| 6 | `ch1ctrl46` | `uWaveSize` **+** `uHueBase` | `op('/ableton_viz/midiin1')['ch1ctrl46'] / 127.0 * 2.5` (size) / `.../127.0` (hue, 0-1) | Amplitude/size in modes 0,1,6,7. Color-spectrum position in mode 5. No conflict — different modes. |
| 7 | `ch1ctrl47` | `uLineWidth` **+** `uBarWidth` | `(.../127.0) ** 2 * 80.0 + 0.1` (line width) / `.../127.0` (bar width, 0-1) | Global line/edge thickness everywhere, and mode-5 bar width (0=vanished, 1=touching, no gap). |
| 8 | `ch1ctrl48` | *(unbound — freed up when `uHueBase` moved to knob 6)* | — | Free. |
| — | `ch1ctrl36` | `uHueOscillate` | `op('/ableton_viz/midiin1')['ch1ctrl36'] / 127.0` | Mode 5 only: how far the hue swings back and forth around `uHueBase` over time. 0 = static. |
| — | `ch1ctrl31`, `ch1ctrl53` | *(seen, unidentified, unbound)* | — | Turned up during testing but never pinned down to a specific physical control. Free. |

### Knob 4 — rate-of-change / smoothing time

Controls how fast the audio-reactive `control` CHOP (which everything above reads from)
responds to changes in the underlying audio, via a Lag CHOP (`lag1`) inserted between the
raw analysis chain and `control`.

```python
lag1.par.lag1.expr = "(1.0 - op('/ableton_viz/midiin1')['ch1ctrl44'] / 127.0) * 1.5"
lag1.par.lag2.expr = "(1.0 - op('/ableton_viz/midiin1')['ch1ctrl44'] / 127.0) * 1.5"
```

Min knob = 1.5s lag (slow, drifting), max knob = 0s lag (instant, snappy).

### Knob 5 — animation speed (`uWavePhase`)

Not a direct MIDI-to-uniform binding. Multiplying elapsed time by a live-changing speed
value causes a big instantaneous jump every time the knob moves (see NOTES.md), and even
with that avoided, the accumulated phase itself grows unbounded over a long session and
loses float precision (also in NOTES.md) — so the knob drives a TD-side accumulator chain,
and the shader wraps that value with `wp()` before using it anywhere:

```
midiin1['ch1ctrl45']  (raw MIDI CC, 0-127)
  -> midi_lag          (Lag CHOP, lag1=lag2=0.4s -- smooths the knob's own movement)
  -> wavespeed_math     (Math CHOP, gain = 3.0/127.0 -- rescales to a 0-3 "rate")
  -> wavespeed_accum    (Speed CHOP, order=First, timeslice on -- integrates the rate
                          into an ever-increasing "phase" value, frame by frame)
```

`uWavePhase`'s Value expression in `glsl1`:
```
op('/ableton_viz/wavespeed_accum')['ch1ctrl45']
```

`uWaveSpeed` is still declared in the shader (and may still have a Vectors row) but is no
longer read by any scene — a legacy leftover from before this fix. Safe to delete its row.

## `uMode` — the 8 visual modes

| Value | Name | Description |
|---|---|---|
| 0 | Waveform | Single oscilloscope trace, built from 8 summed sine waves (one per band). Color cycles slowly and continuously regardless of other knobs. |
| 1 | Multi-wave | 14 overlapping traces sharing one center line — dense EEG/tangle look, each trace a different hue. |
| 2 | Raster bars (ring) | 8 hard-edged vertical bars (classic Ikeda test-pattern), scanlines, crosshair, plus a beat-synced expanding ring. |
| 3 | Moiré | Two overlapping line grids at a slowly rotating relative angle, interference fringes. |
| 4 | Polar burst | Same 8-band bars as mode 2, but radial (angle instead of x, radius instead of height) with concentric beat rings. |
| 5 | Tron equalizer | 8 mirrored, glowing LED-style bars on plain black, growing outward from the vertical center. Anti-aliased edges at every scale (no "boxy" look even at full width). Subdivided into evenly-spaced lines that trace the same silhouette (`uLineDensity`). Palette shifts and can oscillate (`uHueBase`/`uHueOscillate`). |
| 6 | Chromatic bars | 32 densely-packed rainbow bars with a soft glow halo, over a drifting rainbow-striped background. Full color, no monochrome option. |
| 7 | Aurora (Tron) | Near-black background with a big waveform silhouette rendered as a glowing neon edge outline (not a solid fill), plus 4 thin colored traces on top, all hue-shiftable via `uColorMix`. |
| other | Fallback | Plain raster bars, no ring — same look as mode 2 minus the ring, used for any out-of-range `uMode` value. |

## Global helpers all modes share

- `gLevel()` / `gBand()` — `uLevel`/`uBandN` multiplied by `uGain` and clamped to 0-1.
- `tint(hue)` — returns white when `uColorMix` is 0, shifts to that hue (full saturation) as it rises to 1. Used for every colorable line/bar so `uColorMix` works consistently everywhere.
- `hueBase()` — mode 5 only: `uHueBase` plus a `uHueOscillate`-sized sine wobble, driven by the jump-free `wp()` clock.
- `wp()` — `uWavePhase` wrapped to a bounded range so float precision doesn't degrade over a long session. Use this (never raw `uWavePhase`) anywhere something needs to animate over time.
- `hLine()` / `gridLine()` — line-drawing primitives with a built-in neon glow (bright core + soft halo, via `neonFalloff()`) so every mode reads as glowing tubes rather than flat strokes. Both scale thickness by `uLineWidth`.

## Ideas for what's left

Still free: knob/fader 8 (`ch1ctrl48`), the two unidentified channels (`ch1ctrl31`,
`ch1ctrl53`), and every button on the controller.

- **Buttons -> direct mode select**: one button per mode (0-7) instead of sweeping knob 2 —
  needs a small Switch/Logic CHOP to pick "last button pressed" since MIDI buttons aren't
  naturally exclusive.
- **Fader -> master brightness/exposure**: a new `uExposure` uniform multiplying final `col`.
- **Fader -> glitch density**: currently hardcoded `0.03` in the final glitch-pixel line in
  `main()` — expose it as a uniform.
- **Fader -> mode 6/7 background darkness**: currently hardcoded `* 0.5` / `* 0.6` on the
  `rainbowBG()`/dark-horizon calls.
