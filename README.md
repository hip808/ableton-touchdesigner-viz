# Ableton Live 12 -> TouchDesigner live visuals

A TouchDesigner network, synced to Ableton Live's tempo via Ableton Link and
driven by Live's master audio (overall level + an 8-band filter bank), with
live performance control from an 8-knob/8-fader MIDI controller (MVAVE
SMC-Mixer). 8 selectable visual modes ranging from minimal Alva Noto/Ikeda
style monochrome raster bars and oscilloscope waveforms, through generative
moiré and polar patterns, to full-color "chromatic bars" and a Tron-style
neon aurora.

- **[CONTROLS.md](CONTROLS.md)** — full reference: every shader uniform, what it does,
  and the exact MIDI knob it's currently bound to. Read this before a show.
- **[NOTES.md](NOTES.md)** — TouchDesigner gotchas discovered while building this, worth
  reading before extending the network (wrong parameter names fail silently in TD; a few
  cost hours to track down).
- **[ableton_viz_setup.py](ableton_viz_setup.py)** — builds the entire audio-analysis
  TouchDesigner network from scratch via the Textport. Safe to re-run.
- **[shaders/minimal_glitch.frag](shaders/minimal_glitch.frag)** — the actual visuals, one
  GLSL pixel shader with 8 selectable scenes. Hot-reloads on save.

## 1. Install TouchDesigner

Free non-commercial license, macOS build: https://derivative.ca/download
(caps output at 1280x1280 and shows a periodic watermark on long sessions —
fine for building/rehearsing; remove for a paid show license if needed).

## 2. Route Ableton's audio into TouchDesigner (macOS)

TD needs to "hear" Live's master bus via a virtual audio driver:

```bash
brew install blackhole-2ch
```

Then:
1. Open **Audio MIDI Setup** (Spotlight it). Click **+** -> **Create Multi-Output Device**,
   check both your normal speakers/interface AND **BlackHole 2ch**. This lets you still
   hear the mix while TD also receives it.
2. In Ableton Live: **Preferences -> Audio**, set **Output** to that Multi-Output Device.
3. In TouchDesigner, on the `audiodevicein1` CHOP inside `/ableton_viz`, set **Device** to
   **BlackHole 2ch**.

## 3. Enable Ableton Link in Live

Live's control bar needs the Link toggle visible first: **Preferences -> Link/Tempo/MIDI**
-> set **Show Link Toggle** to **Show**. Then click the **Link** button in Live's control
bar to turn it on. No IP/network config needed for one machine — Link auto-discovers over
loopback. The network uses a dedicated **Ableton Link CHOP** (`abletonlink1`), not the
generic Beat CHOP — see [NOTES.md](NOTES.md) for why.

## 4. Connect your MIDI controller

1. Connect the MVAVE SMC-Mixer (or any MIDI controller) — Bluetooth or USB.
2. In TD, open **Dialogs -> MIDI Mapper** once so TD's MIDI subsystem actually scans for
   devices (this populates `/local/midi/device` — skipping this step means a MIDI In CHOP
   just silently fails to open the device). Confirm your controller shows up under
   **Device Mappings**.
3. The network's `midiin1` CHOP (Device ID 1) should then pick it up automatically.

## 5. Build the TouchDesigner network

1. Open TouchDesigner, start a new empty project.
2. Open the **Textport** (Dialogs menu -> Textport).
3. Run:
   ```python
   exec(open('/Users/alanip/Desktop/Claude Code 2026.06.03/touchdesigner-viz/ableton_viz_setup.py').read())
   ```
   This builds the core audio-analysis network (`/ableton_viz`) and prints any manual
   follow-up steps for parameters that don't have a stable Python name across TD versions.
4. The MIDI control layer (`midiin1`, `midi_lag`, `wavespeed_math`, `wavespeed_accum`, and
   all the shader uniform bindings) isn't in the setup script yet — it was built live,
   node by node, in this project's actual session. See [CONTROLS.md](CONTROLS.md) for the
   exact expressions to recreate it, or open the saved `.toe` if you kept one.

## 6. Perform

- Press play in Live. The visuals should react immediately — check [CONTROLS.md](CONTROLS.md)
  if a knob doesn't seem to do anything, most issues so far have been a mis-bound expression,
  not a broken shader.
- Everything visual is plain GLSL in
  [`shaders/minimal_glitch.frag`](shaders/minimal_glitch.frag) — edit that file in any text
  editor while TD is running (it's set to **Sync to File**), save, and TD hot-reloads it
  within a second or two. **Don't leave it open in an editor that autosaves or has a stale
  buffer** — see the TextEdit warning in [NOTES.md](NOTES.md).
- Send the `window1` COMP to a second display/projector: pulse `winopen`, drag it over,
  fullscreen it.

## Why TouchDesigner over the alternatives

- **Max for Live + Jitter**: visuals live inside Ableton, no second app, but Jitter's visual
  toolkit is dated next to TD's GLSL/TOP pipeline.
- **Resolume**: built for VJ clip-triggering, not generative/audio-reactive shader work.
- **Notch**: comparable visual power to TD, but far more expensive and overkill for this.

TouchDesigner is what most artists in this lane (data-driven, monochrome or neon,
precise, beat-synced — Alva Noto, Ryoji Ikeda, Max Cooper) actually reach for, and it's
free to start.
