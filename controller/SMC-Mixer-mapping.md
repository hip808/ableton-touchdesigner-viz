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
| K5 | 34 | `ch1ctrl35` | continuous, lagged | Global: **Ring visibility**. **Mode 4 (3D grid) override:** mesh density, 2×2 (CCW min) to 120×120 cells (CW max). Below ~8×8 the grid is too coarse to show real ripple structure (a hard geometric floor, 4 points can't encode a bump) and the mesh reads as swinging/tilting instead — not a tunable bug. Injection footprint and smoothing-pass count scale with density so the wave's own look/behavior stays constant regardless of where this sits; only mesh resolution changes. **Mode 6 (ridgeline) override:** row/line count, 1 (CCW min) to 200 (CW max) — **opposite direction from Mode 4's K5**. Column count stays fixed at 120 regardless. Rows/columns resample the real CP1919 pulsar dataset (`data/cp1919_pulsar.csv`) fresh every cook, so changing this control live is always safe |
| K6 | 35 | `ch1ctrl36` | continuous, lagged | Global: **Thickness hub** (waveform/bar/ring line width) — **also now drives the soft glow/blur halo** around 2D lines (`uLineWidth`) and both 3D meshes' glow blur (`glow_blur1` in `grid3d`/`ridgeline`), merged in from the old Knob 8 role since they read as visually similar. **Mode 4 override:** mesh line thickness, built via 8-directional pixel-dilation (max-composite), not a blur |
| K7 | 36 | `ch1ctrl37` | continuous, lagged, unbounded | Global: **Waveform X-scale**. **Mode 4 override:** overall mesh scale (0→∞ curve). **Mode 5 (Tron EQ) override:** horizontal distance between the 8 main bars' centers (`uLineDensity`, lagged raw 0..1, pitch mapped 0.07–0.22 mx-units) — up = farther apart (outer bars can run off-screen), down = closer together. Computed in absolute units, fully independent of Knob 6/`uBarWidth` (each bar's own thickness) — widening the gap never also fattens the bars. Fader 7 is this spacing's own breathing rate (`uLineDensityRate`, unbounded log curve via `linedensity_rate`→`linedensity_accum`), same Base/Rate pair convention as every other knob/fader pair. The old comb-subdivision feature this uniform pair used to drive (many thin lines inside each bar, `addExtraLines()`) was removed entirely per request — just the 8 main strokes now |
| K8 | 37 | `ch1ctrl38` | continuous, unbounded | Global: **Optic flow shadow blur, shadows only** (`opticflow_blur1` + `opticflow_blur_bypass`) — true 0 at min via a bypass switch (TD's Blur TOP floors at 1px internally, can't reach 0 through its own size par alone) to strongly blurred at max, quantized to 4px steps to stop TD's Blur TOP from recompiling its kernel every frame. Never blurs the live frame on top, only the trailing echo copies. Replaces the old "Blur/glow amount" role, which moved to Knob 6 (see K6 above) |

## Faders (continuous, CC 40–47 → `ch1ctrl41`–`ch1ctrl48`)

| Fader | CC | Channel | Type | Function in this TD project |
|---|---|---|---|---|
| F1 | 40 | `ch1ctrl41` | continuous, log curve `20·t^2.5` | **Gain** — input-side audio sensitivity, applied to raw band/level values *before* anything reacts to them. Global, including Mode 4's wave-sim injection and Mode 6's per-row band modulation. See `CONTROLS.md` F1-vs-F7 writeup |
| F2 | 41 | `ch1ctrl42` | continuous, bipolar, unbounded | Global: **Speed**. **Mode 4 override:** 3D spin speed (bipolar/center-stop, drives `rotx_rate`→`rotx_accum`, inertial via a 0.2s/0.3s lag) |
| F3 | 42 | `ch1ctrl43` | continuous, unbounded log curve | **Color changing rate** — 0 = frozen on K3's pick, above 0 wobbles the hue away from it, own dedicated phase clock |
| F4 | 43 | `ch1ctrl44` | continuous, unbounded log curve | **Tunnel Hue changing rate** — same mechanism as F3, own dedicated phase clock (`tunhue3d_accum` in Mode 4) |
| F5 | 44 | `ch1ctrl45` | continuous, bipolar | Global: **Ring speed**. **Mode 4 (3D grid) override:** rainbow spread + scroll speed (`color_script1`/`color_to_sop1`) — at 0 the mesh stays a single uniform color (same hue as K3/K4), rising spreads that hue into a full rainbow gradient across the mesh *and* speeds up how fast it scrolls, both from the same raw value. 0 freezes the scroll (same zero-drift convention as the other rate controls). **Mode 6 (ridgeline): intentionally unassigned** — no color effect, by request |
| F6 | 45 | `ch1ctrl46` | continuous, unbounded log curve | Global: **Thickness breathing rate** — also now drives the glow/blur halo's breathing (merged in from the old Fader 8 role) |
| F7 | 46 | `ch1ctrl47` | continuous, decoupled per mode | Global: **Amplitude** (0/1/2) / Spoke Density (7) / Diversity-spread (3) / **bar-spacing breathing rate** (5 — see K7 row). **Mode 4:** independent amplitude curve (`60·t^1.15`) feeding a magnitude-based power-curve compressor on the final wave height (`COMPRESS_POWER` ranges 0.25 at F7 min to 0.5 at F7 max, pivoting at a reference magnitude of 10) — compresses tall peaks harder than gentle ripples, and stays compressed (not 1.0) even at F7 max so peaks never get "substantially" tall. No hard clamp — uncapped by explicit request, the compression curve is what keeps it in check instead. **Mode 6:** peak-to-row-spacing ratio, scaled against a *fixed reference* row spacing (80 rows) rather than the live one — the single loudest point in the real pulsar dataset reaches ~1× that reference spacing at F7 min, ~10× at F7 max (range widened 3× on request), and reads the same regardless of Knob 5's row count (an earlier version scaled against live spacing, which shrank peaks to near-nothing at max density) |
| F8 | 47 | `ch1ctrl48` | continuous, bipolar, unbounded | Global: **Optic flow shadow movement** (`opticflow_zoom_rate`) — direction + speed of the zoom-trail, same center-dead-zone convention as Speed (F2). Up = trail expands outward (toward you); down = trail contracts inward (away); center = frozen. Trail updates in discrete steps (every 15th frame, `opticflow_stamp_source`) rather than blending continuously, so distinct echo copies of the whole pattern stay visible instead of smearing into a glow; `opticflow_decay1` (fixed 0.96×/cook) fades each generation out over time. Replaces the old "Blur breathing rate" role, which moved to Fader 6 (see F6 above) |

## Buttons

| Control | CC | Channel | Type | Function in this TD project |
|---|---|---|---|---|
| 8× mode buttons | 20–27 | `ch1ctrl21`–`ch1ctrl28` | **momentary push**, with LED feedback | Direct mode select 0–7 (one button per mode). Runs in parallel with K1 — `mode_select_exec` (a CHOP Execute DAT on `midiin1`) resolves "last touched wins" and sends the new mode's LED on / old one's off via `midiout1.sendControl()` |
| S button, track 2 | 29 | `ch1ctrl30` | **toggle** (set on the physical controller, not momentary) | **Mode 4 (3D grid) and Mode 6 (ridgeline) position-reset/freeze gate** — same global read in both modes' `tumble_script1`, so engaging it freezes whichever 3D mesh is currently shown (rotation snaps to flat/stationary); released, normal K2/F2-driven rotation resumes on either. Must stay in Toggle mode on the hardware since the gate logic (`> 63`) assumes a sustained state, not a pulse |

## Known gaps / free controls

- F5 is wired to Mode 4's rainbow spread/speed but **intentionally left unassigned in Mode 6**
  (ridgeline) — available there for a future control if needed.
- CC20–27 button *numbers* are physical CCs sent back out for LED control (`sendControl(1, 20+mode, ...)`) — don't reassign them to anything else without updating `mode_select_exec`.

---
**Keep this file in sync:** whenever a control's CC assignment, curve, or function changes in
the TD project, update this document in the same commit.
