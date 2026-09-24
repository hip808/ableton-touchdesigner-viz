# Control reference

Everything the visuals respond to: shader uniforms, what each one does, and the exact
MIDI binding currently wired up in `glsl1`'s Vectors page. All expressions below are typed
directly into a Vector row's first Value box in TD (Name = the uniform name, Value = the
expression).

## Audio-reactive uniforms (bound to the `control` CHOP, not MIDI)

| Uniform | Value expression | What it is |
|---|---|---|
| `uLevel` | `op('control')['level']` | Overall RMS energy of Ableton's master bus, smoothed through `lag1`. |
| `uBand0`...`uBand7` | `op('control')['band0']` ... `op('control')['band7']` | 8-band spectrum (60Hz, 150Hz, 350Hz, 800Hz, 1.8kHz, 3.8kHz, 7.5kHz, 14kHz center frequencies), same smoothing. |
| `uBeat` | `op('control')['ramp']` | 0->1 ramp per beat from the Ableton Link CHOP (`abletonlink1`), tempo-synced to Live. |
| `uTimeSec` | `absTime.seconds` | Elapsed seconds since TD started. GLSL TOP has no built-in time uniform (see NOTES.md) — used for small always-on drifts, never multiplied by a live knob (see `uWavePhase` below for why). |

## MIDI-controlled uniforms (MVAVE SMC-Mixer, Bluetooth, device ID 1 in `midiin1`)

| Knob | MIDI channel | Uniform | Value expression | Range / feel |
|---|---|---|---|---|
| 1 | `ch1ctrl41` | `uGain` | `op('/ableton_viz/midiin1')['ch1ctrl41'] / 127.0 * 20.0` | Sensitivity multiplier on `uLevel`/`uBand0-7`. 0 = flat, ~20 = fully saturated/spiky. |
| 2 | `ch1ctrl42` | `uMode` | `int(op('/ableton_viz/midiin1')['ch1ctrl42'] / 16.0)` | Selects one of 8 visual modes, 0-7 (see table below). |
| 3 | `ch1ctrl43` | `uColorMix` | `op('/ableton_viz/midiin1')['ch1ctrl43'] / 127.0` | 0 = monochrome white/cyan, 1 = full color cycling. |
| 4 | `ch1ctrl44` | *(not a shader uniform — see below)* | drives `lag1.par.lag1`/`lag2` | Audio smoothing time. **Reversed**: min = slow/smooth, max = fast/snappy. |
| 5 | `ch1ctrl45` | *(feeds `uWavePhase` via a CHOP chain — see below)* | — | Animation speed for waveform/multi-wave/aurora traces and background drift. |
| 6 | `ch1ctrl46` | `uWaveSize` | `op('/ableton_viz/midiin1')['ch1ctrl46'] / 127.0 * 2.5` | Amplitude/size scale for all waveform-based modes (0, 1, 6, 7). |
| 7 | `ch1ctrl47` | `uLineWidth` | `(op('/ableton_viz/midiin1')['ch1ctrl47'] / 127.0) ** 2 * 80.0 + 0.1` | Global line/edge thickness. Low = hairline, high (~80) = full-screen blur/glow. |
| 8 | *(unbound)* | — | — | Free for future use. |

Faders 1-8 and all buttons on the SMC-Mixer are currently **unbound** — free to assign
next (see "Ideas for what's left" below).

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

This one is *not* a direct MIDI-to-uniform binding. Multiplying elapsed time by a
live-changing speed value causes a big instantaneous jump every time the knob moves (see
NOTES.md), so the knob instead drives a TD-side accumulator chain:

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

`uWaveSpeed` is still declared in the shader for the Vectors page but is no longer read
by any scene — it's a legacy leftover from before this fix; safe to ignore or remove.

## `uMode` — the 8 visual modes

| Value | Name | Description |
|---|---|---|
| 0 | Waveform | Single oscilloscope trace, built from 8 summed sine waves (one per band), color cycles slowly via `uColorMix`. |
| 1 | Multi-wave | 14 overlapping traces sharing one center line — dense EEG/tangle look, each trace a different hue. |
| 2 | Raster bars (ring) | 8 hard-edged vertical bars (classic Ikeda test-pattern), scanlines, crosshair, plus a beat-synced expanding ring. |
| 3 | Moiré | Two overlapping line grids at a slowly rotating relative angle, interference fringes. |
| 4 | Polar burst | Same 8-band bars as mode 2, but radial (angle instead of x, radius instead of height) with concentric beat rings. |
| 5 | Raster bars (no ring) | Same as mode 2, minus the beat ring. Also the fallback for any out-of-range `uMode` value. |
| 6 | Chromatic bars | 32 densely-packed rainbow bars with a soft glow halo, over a drifting rainbow-striped background. Full color, no monochrome option. |
| 7 | Aurora (Tron) | Near-black background with a big waveform silhouette rendered as a glowing neon edge outline (not a solid fill), plus 4 thin colored traces on top. |

## Global helpers all modes share

- `gLevel()` / `gBand()` — `uLevel`/`uBandN` multiplied by `uGain` and clamped to 0-1.
- `tint(hue)` — returns white when `uColorMix` is 0, shifts to that hue (full saturation) as it rises to 1. Used for every colorable line/bar so `uColorMix` works consistently everywhere.
- `hLine()` / `gridLine()` — line-drawing primitives; both automatically scale their thickness by `uLineWidth`, so every mode's lines/edges respond to knob 7 without needing per-mode changes.

## Ideas for what's left (faders + buttons)

Not yet built, but the SMC-Mixer has 8 unused faders and buttons per channel:

- **Buttons -> direct mode select**: one button per mode (0-7) instead of sweeping knob 2 —
  needs a small Switch/Logic CHOP to pick "last button pressed" since MIDI buttons aren't
  naturally exclusive.
- **Fader -> master brightness/exposure**: a new `uExposure` uniform multiplying final `col`.
- **Fader -> glitch density**: currently hardcoded `0.03` in the final glitch-pixel line in
  `main()` — expose it as a uniform.
- **Fader -> mode 6/7 background darkness**: currently hardcoded `* 0.5` / `* 0.6` on the
  `rainbowBG()`/dark-horizon calls.
