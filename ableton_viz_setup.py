# ableton_viz_setup.py
#
# Run this INSIDE TouchDesigner (Textport, Alt+T on Mac is actually Option+T,
# or paste into a Text DAT and right-click -> Run Script) after opening a
# new empty .toe project. It builds the full audio-reactive node network
# for a minimal, Alva Noto / Ikeda-style visualizer synced to Ableton Live.
#
# It builds everything that's safe to script blind: CHOP audio analysis,
# an 8-band filter bank, Ableton Link beat/tempo, and the output window.
# The last step -- binding the GLSL TOP's auto-generated uniform parameters
# to the control CHOP -- is left as 6 quick manual drags, because those
# parameter names only exist after TD compiles your shader, so scripting
# them blind is more fragile than just doing it once in the UI (instructions
# printed at the end of this script, and in README.md).
#
# Safe to re-run: it deletes any previous 'ableton_viz' container first.

import os

SHADER_PATH = "/Users/alanip/Desktop/Claude Code 2026.06.03/touchdesigner-viz/shaders/minimal_glitch.frag"

BAND_FREQS = [60, 150, 350, 800, 1800, 3800, 7500, 14000]  # Hz, low -> high

root_container = root  # TD's top-level container, available in Textport/DATs

# --- clean slate ---
existing = root_container.op('ableton_viz')
if existing:
	existing.destroy()

base = root_container.create(containerCOMP, 'ableton_viz')
base.nodeX, base.nodeY = 0, 0

def safe_set(op_, parname, value, label=None, hint_keywords=None):
	try:
		getattr(op_.par, parname).val = value
	except Exception as e:
		print("  [manual check] {} on {}: {} (set this by hand in the UI)".format(
			label or parname, op_.path, e))
		if hint_keywords:
			try:
				candidates = sorted(set(
					p.name for p in op_.pars() if any(k in p.name.lower() for k in hint_keywords)
				))
				if candidates:
					print("      possible matching parameter names: {}".format(candidates))
			except Exception:
				pass

# --- 1. audio input from Ableton Live ---
# On macOS, route Ableton Live's master output to a virtual device (e.g. BlackHole 2ch)
# and select that device here. See README.md for the routing steps.
audio_in = base.create(audiodeviceinCHOP, 'audiodevicein1')
audio_in.nodeX, audio_in.nodeY = 0, 400
print("Created audiodevicein1 -- set its 'Device' parameter to your virtual audio device (e.g. BlackHole 2ch).")

# --- 2. overall level (RMS envelope of the whole mix) ---
level_analyze = base.create(analyzeCHOP, 'level_analyze')
level_analyze.nodeX, level_analyze.nodeY = 200, 400
level_analyze.inputConnectors[0].connect(audio_in)
safe_set(level_analyze, 'function', 'rmspower', 'Analyze function')

level_rename = base.create(renameCHOP, 'level_rename')
level_rename.nodeX, level_rename.nodeY = 400, 400
level_rename.inputConnectors[0].connect(level_analyze)
safe_set(level_rename, 'renamefrom', 'chan1', 'rename from')
safe_set(level_rename, 'renameto', 'level', 'rename to')

# --- 3. Ableton Link beat/tempo/phase ---
beat = base.create(beatCHOP, 'beat1')
beat.nodeX, beat.nodeY = 0, 200
safe_set(beat, 'srselect', 'link', 'Beat CHOP sync reference -> Ableton Link', hint_keywords=['link', 'sync', 'sr'])
print("Created beat1 -- if 'srselect' didn't take, set 'Sync Reference Select' to Link by hand on the Beat CHOP.")

# --- 4. 8-band filter bank for the raster bars ---
band_renames = []
x = 0
for i, freq in enumerate(BAND_FREQS):
	flt = base.create(audiofilterCHOP, 'audiofilter{}'.format(i + 1))
	flt.nodeX, flt.nodeY = x, 0
	flt.inputConnectors[0].connect(audio_in)
	safe_set(flt, 'filter', 'bandpass', 'filter type', hint_keywords=['filt', 'type', 'mode'])
	# units must be 'frequency' or 'cutofffrequency' (in Hz) is silently ignored in favor
	# of the (identical-across-all-nodes, default) 'cutofflog' parameter -- this was the
	# root cause of every band reading the exact same value despite different frequencies.
	safe_set(flt, 'units', 'frequency', 'filter units', hint_keywords=['unit'])
	safe_set(flt, 'cutofffrequency', freq, 'center freq', hint_keywords=['freq', 'cutoff', 'center'])

	an = base.create(analyzeCHOP, 'analyze_band{}'.format(i + 1))
	an.nodeX, an.nodeY = x, -200
	an.inputConnectors[0].connect(flt)
	safe_set(an, 'function', 'rmspower', 'Analyze function')

	rn = base.create(renameCHOP, 'rename_band{}'.format(i + 1))
	rn.nodeX, rn.nodeY = x, -400
	rn.inputConnectors[0].connect(an)
	safe_set(rn, 'renamefrom', 'chan1', 'rename from')
	safe_set(rn, 'renameto', 'band{}'.format(i), 'rename to')

	band_renames.append(rn)
	x += 200

# --- 5. merge level + beat + 8 bands into one control CHOP ---
merge = base.create(mergeCHOP, 'control_merge')
merge.nodeX, merge.nodeY = 400, -200
for idx, src in enumerate([level_rename, beat] + band_renames):
	merge.inputConnectors[idx].connect(src)

control = base.create(nullCHOP, 'control')
control.nodeX, control.nodeY = 600, -200
control.inputConnectors[0].connect(merge)

# --- 6. shader source, synced to the .frag file on disk ---
shader_dat = base.create(textDAT, 'minimal_glitch_shader')
shader_dat.nodeX, shader_dat.nodeY = 800, 400
if os.path.exists(SHADER_PATH):
	safe_set(shader_dat, 'file', SHADER_PATH, 'shader file path')
	safe_set(shader_dat, 'syncfile', 1, 'sync to file')
else:
	print("  [warning] shader file not found at {} -- open it in the Text DAT manually.".format(SHADER_PATH))

# --- 7. GLSL TOP running the shader ---
glsl = base.create(glslTOP, 'glsl1')
glsl.nodeX, glsl.nodeY = 800, 200
safe_set(glsl, 'pixeldat', shader_dat.path, 'pixel shader DAT', hint_keywords=['pixel', 'shader', 'dat'])
safe_set(glsl, 'resolutionw', 1920, 'output width', hint_keywords=['res', 'width', 'w'])
safe_set(glsl, 'resolutionh', 1080, 'output height', hint_keywords=['res', 'height', 'h'])

# --- 8. light post pass + fullscreen output window ---
level_post = base.create(levelTOP, 'level_post')
level_post.nodeX, level_post.nodeY = 800, 0
level_post.inputConnectors[0].connect(glsl)

window = base.create(windowCOMP, 'window1')
window.nodeX, window.nodeY = 800, -200
safe_set(window, 'winop', level_post, 'window operator (TOP to display)', hint_keywords=['winop'])
safe_set(window, 'borders', 0, 'borderless', hint_keywords=['border'])
# No scriptable fullscreen toggle on this build: drag the window to your second
# display once open, then use the OS/TD fullscreen shortcut (or right-click the
# window's title bar -> Fullscreen) by hand.

print("")
print("=== Network built under /ableton_viz ===")
print("Manual steps left (about 2 minutes):")
print("1. On audiodevicein1: set Device to your virtual audio input (e.g. 'BlackHole 2ch').")
print("2. On beat1: confirm 'Sync Reference Select' = Link (top toolbar in Live should show Link enabled + a matching beat count).")
print("3. On glsl1: open its Uniforms page (appears after it compiles). For each of")
print("   uLevel, uBeat, uBand0..uBand7, right-click -> Export CHOP -> pick 'control' -> pick the matching channel:")
print("       level -> uLevel")
print("       beat  -> uBeat   (whichever beat1 channel pulses per beat)")
print("       band0..band7 -> uBand0..uBand7")
print("4. Pulse window1's 'winopen' parameter to open it, drag it onto your projector/second display,")
print("   then use the OS/TD fullscreen shortcut (or right-click its title bar -> Fullscreen).")
