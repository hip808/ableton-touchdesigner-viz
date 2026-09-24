// minimal_glitch.frag
// GLSL TOP pixel shader — Alva Noto / Ryoji Ikeda style raster-glitch field.
// Driven entirely by uniforms bound to Ableton audio/tempo data (see ableton_viz_setup.py).
//
// Uniforms (bind these in the GLSL TOP's "Vectors" page, each pointing at a
// channel on /ableton_viz/control, except uMode which you can just type a
// number into):
//   uLevel   float  - overall RMS envelope of the Ableton master, 0..1
//   uBeat    float  - 0..1 ramp per beat, from Ableton Link
//   uBand0-7 float  - 8-band spectrum, 0..1 each
//   uTimeSec float  - elapsed seconds -> op('control')['level'] etc, or type absTime.seconds
//   uMode    float  - which pattern to draw: 0=waveform, 1=multi-wave, 2=raster bars (ring),
//                     3=moire, 4=polar burst, 5=raster bars (no ring), 6=chromatic bars
//                     (rainbow bg + glowing bars), 7=aurora (rainbow bg + filled wave
//                     blob + thin traces). type a whole number 0-7.
//   uGain    float  - sensitivity multiplier for uLevel/uBand0-7, since raw RMS values
//                     from a real mix are usually small (0.01-0.1). Type a number like
//                     4-15 directly into its Value box and raise/lower until it feels right.
//   uColorMix float - 0 = pure monochrome (white), 1 = full color. 0..1, bind to a MIDI knob.
//   uWaveSize  float - amplitude scale for waveform/multi-wave/aurora traces. try 0.3-2.5.
//   uWaveSpeed float - not read directly by this shader anymore; kept declared for the
//                      Vectors page. The actual speed knob drives a TD-side chain
//                      (midi_lag -> wavespeed_math -> wavespeed_accum, a Speed CHOP) that
//                      feeds uWavePhase below -- multiplying raw elapsed time by a live
//                      knob value causes a big instantaneous jump every time the knob
//                      moves, so animation speed is driven by an accumulated value instead.
//   uWavePhase float - accumulated animation clock, bind to wavespeed_accum's output channel.
//   uMode == 1 is the multi-wave pattern: many overlapping traces sharing one
//   center line (like a dense EEG/oscilloscope tangle), separate from mode 0's single line.

uniform float uLevel;
uniform float uBeat;
uniform float uBand0;
uniform float uBand1;
uniform float uBand2;
uniform float uBand3;
uniform float uBand4;
uniform float uBand5;
uniform float uBand6;
uniform float uBand7;
uniform float uTimeSec;
uniform float uMode;
uniform float uGain;
uniform float uColorMix;
uniform float uWaveSpeed;
uniform float uWavePhase; // accumulated animation clock from a TD Speed CHOP -- see waveformY
uniform float uWaveSize;
uniform float uLineWidth; // global thickness multiplier for all lines/edges. try 0.3-3.0, 1.0 = default

out vec4 fragColor;

// standard HSV -> RGB, h/s/v all 0..1
vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// white when uColorMix is 0, shifts toward a hue-cycled color as it rises toward 1
vec3 tint(float hue) {
	return mix(vec3(1.0), hsv2rgb(vec3(hue, 0.85, 1.0)), uColorMix);
}

// full-screen drifting rainbow stripes, used as a background wash for the "rich/bright"
// modes -- kept darker than the foreground line work so lines/bars still read clearly.
vec3 rainbowBG(vec2 uv) {
	// small fixed-rate baseline (always flows, never jumps -- constant coefficient) plus
	// an accumulator-driven component tied to the speed knob (also jump-free, see uWavePhase)
	float hue = fract(uv.y * 1.4 + uTimeSec * 0.008 + uWavePhase * 0.02);
	return hsv2rgb(vec3(hue, 0.85, 0.55));
}

// gained + clamped versions of the raw audio uniforms -- use these instead of
// uLevel/uBand0-7 directly anywhere you want sensitivity to track uGain.
float gLevel() { return clamp(uLevel * uGain, 0.0, 1.0); }
float gBand(float b) { return clamp(b * uGain, 0.0, 1.0); }

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// thin monochrome grid line, width controlled by band energy. "width" is always
// scaled by uLineWidth here, so every caller respects the global thickness knob.
float gridLine(float coord, float cells, float width) {
	float f = fract(coord * cells);
	float d = min(f, 1.0 - f);
	return smoothstep(width * uLineWidth, 0.0, d);
}

// thin horizontal line at height y0, thickness "width" in uv units, scaled by uLineWidth
float hLine(float y, float y0, float width) {
	return smoothstep(width * uLineWidth, 0.0, abs(y - y0));
}

void sceneRasterBars(vec2 uv, vec2 res, vec2 pix, float bands[8], inout vec3 col, bool showRing) {
	// --- 8 vertical raster bars keyed to spectrum bands (Ikeda test-pattern feel) ---
	float barW = 1.0 / 8.0;
	int idx = int(floor(uv.x * 8.0));
	float bandVal = bands[clamp(idx, 0, 7)];
	float localX = fract(uv.x * 8.0);

	float barTop = 0.5 + bandVal * 0.45;
	float barBottom = 0.5 - bandVal * 0.45;
	float inBar = step(1.0 - barTop, uv.y) * step(uv.y, 1.0 - barBottom);
	float edge = step(0.5 - barW * 0.5 + 0.002, localX) * step(localX, 0.5 + barW * 0.5 - 0.002);
	col += tint(float(idx) / 8.0) * inBar * edge * (0.55 + 0.45 * bandVal);

	float scan = gridLine(uv.y, mix(80.0, 260.0, gLevel()), 0.06);
	col += vec3(0.12) * scan;

	float cross = gridLine(uv.x, 1.0, 0.0015) + gridLine(uv.y, 1.0, 0.0015);
	col += vec3(0.25) * cross;

	if (showRing) {
		vec2 c = uv - 0.5;
		c.x *= res.x / res.y;
		float r = length(c);
		float ring = smoothstep(0.02, 0.0, abs(r - uBeat * 1.4));
		col += vec3(1.0) * ring;
	}
}

// one synthesized oscilloscope trace: sum of sine waves, one per band, amplitude = band
// energy. this is the classic Alva Noto "test tone" look -- not real audio samples, but a
// waveform genuinely built from your live band levels. laneAmp = how tall it's allowed to
// get, phase = offset so multiple traces don't all move in lockstep, speedMult = a fixed
// relative multiplier (NOT the live speed knob -- that's already baked into uWavePhase,
// which is an accumulated value from TD's Speed CHOP, not raw elapsed time. Using elapsed
// time * a live-changing speed knob directly causes a huge instantaneous phase jump every
// time the knob moves, since elapsed time keeps growing for the whole session -- the
// accumulator avoids that entirely).
float waveformY(float x, float bands[8], float laneAmp, float phase, float speedMult) {
	float y = 0.0;
	for (int i = 0; i < 8; i++) {
		float freq = 3.0 + float(i) * 5.0;
		float amp = bands[i] * laneAmp; // 0 when silent -> perfectly straight line
		y += sin(x * freq * 6.2831 + phase + uWavePhase * speedMult * (1.0 + float(i) * 0.3)) * amp;
	}
	return y;
}

// mode 1: single oscilloscope trace, centered on the middle of the frame
void sceneWaveform(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	float y = waveformY(uv.x, bands, 0.09 * uWaveSize, 0.0, 1.0);
	float line = hLine(uv.y, 0.5 + y, 0.0025);
	col += tint(fract(uTimeSec * 0.05)) * line;

	col += vec3(0.15) * hLine(uv.y, 0.5, 0.0008);
	float scan = gridLine(uv.y, 120.0, 0.05);
	col += vec3(0.08) * scan;
}

// mode 4: many overlapping traces sharing one center line, each at a different
// frequency/phase -- the dense tangled-EEG look. uWaveSpeed and uWaveSize control
// the whole cluster's animation speed and amplitude.
void sceneMultiWave(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	const int TRACES = 14;
	float size = uWaveSize;
	for (int j = 0; j < TRACES; j++) {
		float fj = float(j);
		float phase = fj * 1.7;
		float laneAmp = (0.05 + 0.01 * fj) * size;
		float y = waveformY(uv.x, bands, laneAmp, phase, 0.6 + 0.08 * fj);
		float line = hLine(uv.y, 0.5 + y, 0.0016);
		float hue = fract(fj / float(TRACES) + uWavePhase * 0.06);
		col += tint(hue) * line * 0.85;
	}

	col += vec3(0.1) * hLine(uv.y, 0.5, 0.0006);
}

void scenePolarBurst(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	// radial version of the raster bars: angle instead of x, radius instead of height
	vec2 c = uv - 0.5;
	c.x *= res.x / res.y;
	float r = length(c);
	float ang = atan(c.y, c.x) / 6.2831 + 0.5; // 0..1 around the circle

	int idx = int(floor(ang * 8.0));
	float bandVal = bands[clamp(idx, 0, 7)];
	float localA = fract(ang * 8.0);

	float rTarget = 0.08 + bandVal * 0.42;
	float spoke = smoothstep(0.006, 0.0, abs(r - rTarget));
	float wedge = step(0.5 - 0.4, localA) * step(localA, 0.5 + 0.4); // narrow each spoke
	col += tint(ang) * spoke * wedge;

	// concentric rings ticking out from the beat
	float rings = gridLine(r - uBeat * 0.3, 10.0, 0.02);
	col += vec3(0.18) * rings;
}

// mode 6: dense rainbow bar chart with a soft glow halo, over a drifting rainbow-stripe
// background -- the "rich and bright" chromatic EQ look.
void sceneChromaticBars(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	col = rainbowBG(uv) * 0.5;

	const int N = 32; // denser than the 8 raw bands -- each band drives 4 neighboring bars
	float barW = 1.0 / float(N);
	for (int k = 0; k < N; k++) {
		float fk = float(k);
		int bandIdx = int(mod(fk * 0.25, 8.0));
		float bandVal = bands[bandIdx];
		float cx = (fk + 0.5) * barW;
		float distX = abs(uv.x - cx);

		float top = 0.5 + bandVal * 0.48 * uWaveSize;
		float bottom = 0.5 - bandVal * 0.48 * uWaveSize;
		float inBand = step(bottom, uv.y) * step(uv.y, top);

		vec3 c = hsv2rgb(vec3(fract(cx + uTimeSec * 0.02), 0.9, 1.0));

		float core = step(distX, barW * 0.35) * inBand;
		col += c * core;

		float halo = smoothstep(barW * 2.5, 0.0, distX) * inBand;
		col += c * halo * 0.35 * bandVal;
	}
}

// mode 7: Tron-style -- near-black background, a big waveform silhouette rendered as a
// glowing neon edge (not a solid fill), plus thin bright traces on top. uColorMix still
// controls whether the neon glow and traces are white/cyan or shift through hues.
void sceneAurora(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	// near-black bg with a faint glow toward the horizontal center, like a dark horizon
	float horizon = exp(-abs(uv.y - 0.5) * 3.0);
	col = vec3(0.0, 0.015, 0.03) + vec3(0.0, 0.08, 0.14) * horizon;

	float env = abs(waveformY(uv.x, bands, 0.4 * uWaveSize, 0.0, 0.5)) + 0.015;
	float top = 0.5 + env;
	float bottom = 0.5 - env;

	// subtle dark interior tint (not a bright solid fill -- keeps the Tron "negative space" feel)
	float inside = step(bottom, uv.y) * step(uv.y, top);
	col += vec3(0.0, 0.03, 0.05) * inside;

	// glowing neon edge along the top and bottom of the silhouette
	vec3 neon = tint(0.52); // cyan by default, shifts with uColorMix
	float glowTop = exp(-abs(uv.y - top) * 60.0 / max(uLineWidth, 0.05));
	float glowBottom = exp(-abs(uv.y - bottom) * 60.0 / max(uLineWidth, 0.05));
	col += neon * (glowTop + glowBottom) * 0.9;
	col += vec3(1.0) * hLine(uv.y, top, 0.0015);
	col += vec3(1.0) * hLine(uv.y, bottom, 0.0015);

	const int TRACES = 4;
	for (int j = 0; j < TRACES; j++) {
		float fj = float(j);
		float y = waveformY(uv.x, bands, 0.12 * uWaveSize, fj * 1.7, 1.0);
		float line = hLine(uv.y, 0.5 + y, 0.0018);
		float hue = fract(fj / float(TRACES) + uTimeSec * 0.05);
		col += tint(hue) * line;
	}
}

void sceneMoire(vec2 uv, vec2 res, inout vec3 col) {
	// two overlapping line grids at a slight relative rotation -> interference pattern.
	// rotation speed and density respond to level/time for a slow generative drift.
	float ang = uTimeSec * 0.05 + gLevel() * 0.4;
	vec2 p = uv - 0.5;
	vec2 p2 = vec2(p.x * cos(ang) - p.y * sin(ang), p.x * sin(ang) + p.y * cos(ang));

	float density = mix(40.0, 90.0, gLevel());
	float g1 = gridLine(p.x, density, 0.08);
	float g2 = gridLine(p2.x, density, 0.08);
	col += tint(uTimeSec * 0.03) * min(g1, g2) * 0.9; // bright where both grids overlap (moire fringes)
	col += vec3(0.06) * max(g1, g2);            // faint where only one grid hits

	float ring = smoothstep(0.02, 0.0, abs(length(p * vec2(res.x / res.y, 1.0)) - uBeat * 1.4));
	col += vec3(1.0) * ring;
}

void main() {
	vec2 uv = vUV.st; // TD provides vUV in [0,1] across the render target
	vec2 res = uTDOutputInfo.res.zw; // output resolution
	vec2 pix = uv * res;

	vec3 col = vec3(0.0); // pure black canvas
	float bands[8] = float[8](
		gBand(uBand0), gBand(uBand1), gBand(uBand2), gBand(uBand3),
		gBand(uBand4), gBand(uBand5), gBand(uBand6), gBand(uBand7)
	);

	// uMode mapping: 0=waveform, 1=multi-wave, 2=raster bars (with ring),
	// 3=moire, 4=polar burst, 5=raster bars (no ring), 6=chromatic bars,
	// 7=aurora. anything else falls back to 5's look (raster bars, no ring).
	int mode = int(uMode + 0.5);
	if (mode == 0) {
		sceneWaveform(uv, res, bands, col);
	} else if (mode == 1) {
		sceneMultiWave(uv, res, bands, col);
	} else if (mode == 2) {
		sceneRasterBars(uv, res, pix, bands, col, true);
	} else if (mode == 3) {
		sceneMoire(uv, res, col);
	} else if (mode == 4) {
		scenePolarBurst(uv, res, bands, col);
	} else if (mode == 6) {
		sceneChromaticBars(uv, res, bands, col);
	} else if (mode == 7) {
		sceneAurora(uv, res, bands, col);
	} else {
		sceneRasterBars(uv, res, pix, bands, col, false);
	}

	// --- sparse glitch pixels, density tied to overall level, layered on every mode ---
	float n = hash(floor(pix / 3.0) + floor(uTimeSec * 24.0));
	float glitch = step(0.995 - gLevel() * 0.03, n);
	col += vec3(1.0) * glitch;

	fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
