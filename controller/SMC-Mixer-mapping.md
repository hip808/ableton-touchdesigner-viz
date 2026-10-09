# MVAVE SMC-Mixer — MIDI mapping for this project

The preset file [`SMC 4 TD.smc`](SMC%204%20TD.smc) is the MVAVE editor's own save format for
this mapping — it's a proprietary binary (no public spec, not human-readable; `strings`
finds nothing, and the body is mostly fixed-size SysEx/MMC-command records). It's kept here
as a backup/restore artifact so the physical controller can be re-flashed if needed, but **this
document is the actual reference** — every CC number, channel name, and control type below was
read directly off the live MIDI stream and the TD project's own expressions/scripts, not
decoded from the binary.

**Scope:** only controls actually wired into this project are documented. The SMC-Mixer has
more knobs/faders/buttons than are listed here — unused ones aren't included.

## How channel names work

TD's `midiin1` CHOP has `onebased: true`, which adds **+1** to every raw MIDI CC number when
building its channel name. So physical **CC30** arrives in TD as **`ch1ctrl31`**, physical
**CC40** arrives as **`ch1ctrl41`**, and so on. The table below gives both numbers.

## Knobs (continuous, CC 30–37 → `ch1ctrl31`–`ch1ctrl38`)

| Knob | CC | Channel | Type | Function in this TD project |
|---|---|---|---|---|
| K1 | 30 | `ch1ctrl31` | continuous, linear | **Mode select** (0–7) — `int(val/16)`, clamped. Runs in parallel with the CC20–27 push buttons below; whichever last changes wins (see `mode_select_exec`) |
| K2 | 31 | `ch1ctrl32` | continuous | Global: **Rotation** (modes 3/6/7). **Mode 4 (3D grid) override:** wobble/tumble complexity — 0 = clean single-axis spin, 1 = full axis-precession tumble |
| K3 | 32 | `ch1ctrl33` | continuous, **raw/unlagged** (direct response, no smoothing) | **Color Mix** — hue-wheel position *and* white↔color saturation blend (`cm`); at 0 the mesh/trace is white, rising toward 1 sweeps the hue wheel at increasing saturation (full saturation only right at the wraparound). See `CONTROLS.md` for the K3/K4 saturation-coupling writeup |
| K4 | 33 | `ch1ctrl34` | continuous, lagged (via `midi_lag`) | **Tunnel Hue** — additive hue offset, layered on top of K3 in every mode; the only way to get a fully-saturated non-red color, since it doesn't affect saturation. Has a structurally different **native (non-color) role in Mode 7** |
| K5 | 34 | `ch1ctrl35` | continuous, lagged | Global: **Ring visibility**. **Mode 4 (3D grid) override:** mesh density, CW = denser, max raised to 120 cells |
| K6 | 35 | `ch1ctrl36` | continuous, lagged | Global: **Thickness hub** (waveform/bar/ring line width). **Mode 4 override:** mesh line thickness, built via 8-directional pixel-dilation (max-composite), not a blur |
| K7 | 36 | `ch1ctrl37` | continuous, lagged, unbounded | Global: **Waveform X-scale**. **Mode 4 override:** overall mesh scale (0→∞ curve) |
| K8 | 37 | `ch1ctrl38` | continuous, lagged, unbounded | Global: **Blur/glow amount**. Size is **quantized to 20px steps** in Mode 4 to stop TD's Blur TOP from recompiling its kernel every frame (was causing severe slowdown at arbitrary float sizes) |

## Faders (continuous, CC 40–47 → `ch1ctrl41`–`ch1ctrl48`)

| Fader | CC | Channel | Type | Function in this TD project |
|---|---|---|---|---|
| F1 | 40 | `ch1ctrl41` | continuous, log curve `20·t^2.5` | **Gain** — input-side audio sensitivity, applied to raw band/level values *before* anything reacts to them. Global, including Mode 4's wave-sim injection. See `CONTROLS.md` F1-vs-F7 writeup |
| F2 | 41 | `ch1ctrl42` | continuous, bipolar, unbounded | Global: **Speed**. **Mode 4 override:** 3D spin speed (bipolar/center-stop, drives `rotx_rate`→`rotx_accum`, inertial via a 0.2s/0.3s lag) |
| F3 | 42 | `ch1ctrl43` | continuous, unbounded log curve | **Color changing rate** — 0 = frozen on K3's pick, above 0 wobbles the hue away from it, own dedicated phase clock |
| F4 | 43 | `ch1ctrl44` | continuous, unbounded log curve | **Tunnel Hue changing rate** — same mechanism as F3, own dedicated phase clock (`tunhue3d_accum` in Mode 4) |
| F5 | 44 | `ch1ctrl45` | continuous, bipolar | Global: **Ring speed**. **Unused in Mode 4** since the K2/F2 rotation rebuild — freed up, nothing currently wired to it there |
| F6 | 45 | `ch1ctrl46` | continuous, unbounded log curve | Global: **Thickness breathing rate** |
| F7 | 46 | `ch1ctrl47` | continuous, decoupled per mode | Global: **Amplitude** (0/1/2) / Spoke Density (7) / Diversity-spread (3) / line density (5). **Mode 4:** independent amplitude curve (`60·t^1.15`), final displacement **hard-clamped to ±25 world units** so no setting can push the mesh off-frame |
| F8 | 47 | `ch1ctrl48` | continuous, unbounded log curve | Global: **Blur breathing rate** — can reach real strobing |

## Buttons

| Control | CC | Channel | Type | Function in this TD project |
|---|---|---|---|---|
| 8× mode buttons | 20–27 | `ch1ctrl21`–`ch1ctrl28` | **momentary push**, with LED feedback | Direct mode select 0–7 (one button per mode). Runs in parallel with K1 — `mode_select_exec` (a CHOP Execute DAT on `midiin1`) resolves "last touched wins" and sends the new mode's LED on / old one's off via `midiout1.sendControl()` |
| S button, track 2 | 29 | `ch1ctrl30` | **toggle** (set on the physical controller, not momentary) | **Mode 4 (3D grid) position-reset/freeze gate** — while engaged, rotation snaps to flat/stationary (0,0,0); released, normal K2/F2-driven rotation resumes. Must stay in Toggle mode on the hardware since the gate logic (`> 63`) assumes a sustained state, not a pulse |

## Known gaps / free controls

- **F5 is currently unused in Mode 4** (freed up when rotation was rebuilt around K2+F2 only) — available for a future control if needed.
- CC20–27 button *numbers* are physical CCs sent back out for LED control (`sendControl(1, 20+mode, ...)`) — don't reassign them to anything else without updating `mode_select_exec`.

---
**Keep this file in sync:** whenever a control's CC assignment, curve, or function changes in
the TD project, update this document in the same commit.
