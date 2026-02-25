/**
 * FeedbackDetector (ultimate merged)
 *
 * Core engine (from Deep Think Gemini):
 *  - requestAnimationFrame loop (React-friendly)
 *  - preallocated typed-array buffers (zero-allocation per frame)
 *  - background/throttling guard resets sustain history
 *  - passive routing: Mic -> AnalyserNode ONLY (never to destination)
 *
 * Features (ported from ChatGPT improved):
 *  - Median noise-floor tracker (robust) with Attack/Release EMA
 *  - Hybrid thresholding: max(absoluteThreshold, noiseFloor + relativeThreshold)
 *  - Frequency bounding: minFrequencyHz / maxFrequencyHz
 *  - O(1) Prefix Sums for neighborhood energy (crest/prominence)
 *
 * CRITICAL MATH FIX (required):
 *  - When computing neighborhood totalPower from prefix sums, apply Blackman
 *    window exclusion (±1 leakage):
 *      totalPower -= power[i-1] + power[i] + power[i+1]
 *      count = (2 * nb - 2)
 */
class FeedbackDetector {
  constructor({
    // Core
    fftSize = 2048,

    // Thresholding
    thresholdMode = "hybrid",     // "absolute" | "relative" | "hybrid"
    thresholdDb = -35,            // absolute threshold (dB)
    relativeThresholdDb = 20,     // relative to noise floor (dB above floor)

    // Peak validation
    prominenceDb = 15,            // required dB above surrounding avg ENERGY
    neighborhoodBins = 6,         // bins on EACH side (must be >= 2 for ±1 exclusion)

    // Time continuity
    sustainMs = 400,              // must remain valid in SAME bin for >= sustainMs
    clearMs = 200,                // must remain invalid for >= clearMs to clear

    // Analysis cadence (RAF still runs each frame; analysis is throttled to this interval)
    analysisIntervalMs = 25,

    // Frequency range
    minFrequencyHz = 80,
    maxFrequencyHz = 12000,

    // Noise floor tracker
    noiseFloor = {
      enabled: true,
      sampleCount: 192,           // bins sampled to estimate median floor
      attackMs: 250,              // how fast floor rises
      releaseMs: 1200             // how fast floor falls
    },

    // Analyser config
    minDecibels = -100,
    maxDecibels = 0,
    smoothingTimeConstant = 0,

    // Psychoacoustics
    aWeightingEnabled = false,

    // Callbacks
    onFeedbackDetected = null,
    onFeedbackCleared = null
  } = {}) {
    // Callbacks
    this.onFeedbackDetected = onFeedbackDetected;
    this.onFeedbackCleared = onFeedbackCleared;

    // Tunables
    this._fftSize = fftSize;

    this._thresholdMode = String(thresholdMode);
    this._thresholdDb = thresholdDb;
    this._relativeThresholdDb = relativeThresholdDb;

    this._prominenceDb = prominenceDb;

    // With ±1 Blackman exclusion, nb must be >= 2 (otherwise count <= 0).
    this._neighborhoodBins = Math.max(2, neighborhoodBins | 0);

    this._sustainMs = Math.max(0, sustainMs);
    this._clearMs = Math.max(0, clearMs);

    this._analysisIntervalMs = Math.max(1, analysisIntervalMs | 0);

    this._minFrequencyHz = Math.max(0, minFrequencyHz);
    this._maxFrequencyHz = Math.max(this._minFrequencyHz, maxFrequencyHz);

    this._noiseFloorEnabled = !!(noiseFloor && noiseFloor.enabled);
    this._noiseFloorSampleCount = Math.max(32, (noiseFloor?.sampleCount ?? 192) | 0);
    this._noiseFloorAttackMs = Math.max(20, noiseFloor?.attackMs ?? 250);
    this._noiseFloorReleaseMs = Math.max(50, noiseFloor?.releaseMs ?? 1200);

    this._minDecibels = minDecibels;
    this._maxDecibels = maxDecibels;
    this._smoothingTimeConstant = smoothingTimeConstant;

    // A-weighting (optional)
    this._aWeightingEnabled = !!aWeightingEnabled;
    this.aWeightingTable = null;       // Float32Array dB offsets per bin (precomputed)
    this._aWeightingMinDb = 0;         // min table value (for clamping bounds)
    this._aWeightingMaxDb = 0;         // max table value (for clamping bounds)
    this._analysisMinDb = this._minDecibels;
    this._analysisMaxDb = this._maxDecibels;

    // WebAudio objects
    this._audioContext = null;
    this._stream = null;
    this._source = null;
    this._analyser = null;

    // Buffers (preallocated)
    this._freqDb = null;          // Float32Array dB values
    this._power = null;           // Float32Array linear power per bin
    this._prefix = null;          // Float64Array prefix sums of power (n+1)
    this._holdMs = null;          // Float32Array consecutive-valid time per bin
    this._deadMs = null;          // Float32Array consecutive-invalid time (while active)
    this._active = null;          // Uint8Array active flags (0/1)

    // Active-node metadata (preallocated)
    this._activeHz = null;        // Float32Array trueFrequencyHz per bin (0 if inactive)
    this._activeBins = null;      // Uint32Array list of active bin indices
    this._activeBinPos = null;    // Int32Array binIndex -> position in _activeBins (or -1)
    this._activeCount = 0;        // number of active bins

    // Frequency bounds (bin indices)
    this._startBin = 1;
    this._endBin = 0;             // start > end => empty range
    this._effectiveNb = 2;

    // Noise floor sampling
    this._noiseFloorDb = null;
    this._noiseSampleIdx = null;  // Uint32Array of indices to sample
    this._noiseSamples = null;    // Float32Array sample dB values (reused)

    // RAF loop state
    this._isRunning = false;
    this._rafId = 0;
    this._lastRafTs = 0;
    this._lastAnalysisTs = 0;

    // If RAF is throttled (background tab), wipe sustain history to prevent false “instant sustain”.
    this._maxAnalysisGapMs = Math.max(2 * this._analysisIntervalMs, 120);

    // Bind
    this._rafLoop = this._rafLoop.bind(this);
  }

  // ---------------- Public API ----------------

  /**
   * Starts passive microphone analysis.
   *
   * Supported calls:
   *   - await start(mediaStream)
   *   - await start({ stream, audioContext, constraints })
   */
  async start(arg = {}) {
    if (this._isRunning) return;

    // Normalize args
    let audioContext = null;
    let stream = null;
    let constraints = null;

    if (arg && typeof arg === "object" && (typeof arg.getTracks === "function")) {
      // MediaStream passed directly
      stream = arg;
    } else if (arg && typeof arg === "object") {
      audioContext = arg.audioContext || null;
      stream = arg.stream || null;
      constraints = arg.constraints || null;
    }

    // AudioContext
    if (!this._audioContext) {
      const Ctx = (typeof window !== "undefined")
        ? (window.AudioContext || window.webkitAudioContext)
        : null;

      if (!Ctx && !audioContext) throw new Error("Web Audio API not supported.");
      this._audioContext = audioContext || new Ctx();
    }

    // Stream
    if (stream) {
      this._stream = stream;
    } else if (!this._stream) {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia() not supported.");
      }

      // Defaults: try to avoid processing that masks feedback tones.
      const defaultConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      this._stream = await navigator.mediaDevices.getUserMedia(constraints || defaultConstraints);
    }

    // Analyser
    if (!this._analyser) {
      this._analyser = this._audioContext.createAnalyser();
      this._analyser.minDecibels = this._minDecibels;
      this._analyser.maxDecibels = this._maxDecibels;
      this._analyser.smoothingTimeConstant = this._smoothingTimeConstant;
    }

    // FFT size (allocates analyser internals)
    this.setFftSize(this._fftSize);

    // Source (recreate each start so stream swaps are safe)
    if (this._source) {
      try { this._source.disconnect(); } catch (_) {}
      this._source = null;
    }
    this._source = this._audioContext.createMediaStreamSource(this._stream);

    // PASSIVE ROUTING: mic -> analyser ONLY
    this._source.connect(this._analyser);

    // Resume context
    if (this._audioContext.state !== "running") {
      await this._audioContext.resume();
    }

    // Start RAF loop
    this._isRunning = true;
    this._lastRafTs = 0;
    this._lastAnalysisTs = 0;
    this._rafId = requestAnimationFrame(this._rafLoop);
  }

  /**
   * Stops analysis loop. Optionally release mic tracks.
   */
  stop({ releaseMic = false } = {}) {
    this._isRunning = false;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }

    this._lastRafTs = 0;
    this._lastAnalysisTs = 0;

    this._resetHistory();

    if (this._source) {
      try { this._source.disconnect(); } catch (_) {}
      this._source = null;
    }

    if (releaseMic && this._stream) {
      for (const t of this._stream.getTracks()) t.stop();
      this._stream = null;
    }

    // Intentionally do NOT close AudioContext (React-friendly).
  }

  // ---- Live updates (no AudioContext destruction) ----

  setFftSize(fftSize) {
    if (!FeedbackDetector._isValidFftSize(fftSize)) {
      throw new Error("fftSize must be a power of two between 32 and 32768.");
    }
    this._fftSize = fftSize;

    if (this._analyser) {
      this._analyser.fftSize = fftSize;
      this._allocateBuffers();
      this._resetHistory();
    }
  }

  setThresholdDb(thresholdDb) { this._thresholdDb = thresholdDb; }
  setRelativeThresholdDb(relativeDb) { this._relativeThresholdDb = relativeDb; }

  setThresholdMode(mode) {
    const m = String(mode);
    if (m !== "absolute" && m !== "relative" && m !== "hybrid") {
      throw new Error('thresholdMode must be "absolute", "relative", or "hybrid".');
    }
    this._thresholdMode = m;
  }

  setProminenceDb(prominenceDb) { this._prominenceDb = prominenceDb; }

  setSustainMs(ms) {
    this._sustainMs = Math.max(0, ms);
    this._resetHistory();
  }

  setClearMs(ms) {
    this._clearMs = Math.max(0, ms);
    // no need to reset
  }

  setNeighborhoodBins(bins) {
    // Must be >= 2 due to (i-1,i,i+1) exclusion.
    this._neighborhoodBins = Math.max(2, bins | 0);
    this._recomputeDerivedIndices();
    this._resetHistory();
  }

  setFrequencyRange(minHz, maxHz) {
    this._minFrequencyHz = Math.max(0, minHz);
    this._maxFrequencyHz = Math.max(this._minFrequencyHz, maxHz);
    this._recomputeDerivedIndices();
    this._resetHistory();
  }

  setAnalysisIntervalMs(ms) {
    this._analysisIntervalMs = Math.max(1, ms | 0);
    this._maxAnalysisGapMs = Math.max(2 * this._analysisIntervalMs, 120);
    // No reset needed, but safe to avoid edge cases:
    this._resetHistory();
  }

  setNoiseFloorEnabled(enabled) {
    this._noiseFloorEnabled = !!enabled;
    if (!enabled) this._noiseFloorDb = null;
  }

  setAWeightingEnabled(enabled) {
    this._aWeightingEnabled = !!enabled;
    this._recomputeAnalysisDbBounds();

    // Noise floor + sustain history must be reset because the measurement domain changed.
    this._noiseFloorDb = null;
    this._resetHistory();
  }

  get aWeightingEnabled() { return this._aWeightingEnabled; }

  // ---- Introspection ----

  get isRunning() { return this._isRunning; }
  get fftSize() { return this._analyser ? this._analyser.fftSize : this._fftSize; }
  get sampleRate() { return this._audioContext?.sampleRate ?? null; }
  get noiseFloorDb() { return this._noiseFloorDb; }

  get effectiveThresholdDb() {
    return this._computeEffectiveThresholdDb();
  }

  binToFrequency(binIndex) {
    const sr = this.sampleRate;
    const fft = this.fftSize;
    if (!sr || !fft) return null;
    return (binIndex * sr) / fft;
  }

  // ---------------- Internals ----------------

  _allocateBuffers() {
    const analyser = this._analyser;
    if (!analyser) return;

    const n = analyser.frequencyBinCount;

    this._freqDb = new Float32Array(n);
    this._power = new Float32Array(n);
    this._prefix = new Float64Array(n + 1);

    this._holdMs = new Float32Array(n);
    this._deadMs = new Float32Array(n);
    this._active = new Uint8Array(n);

    // Active-node metadata
    this._activeHz = new Float32Array(n);
    this._activeBins = new Uint32Array(n);
    this._activeBinPos = new Int32Array(n);
    this._activeBinPos.fill(-1);
    this._activeCount = 0;

    // A-weighting lookup table
    this.aWeightingTable = new Float32Array(n);
    this._computeAWeightingTable();
    this._recomputeAnalysisDbBounds();

    this._noiseFloorDb = null;

    this._recomputeDerivedIndices();
  }

  _resetHistory() {
    if (this._holdMs) this._holdMs.fill(0);
    if (this._deadMs) this._deadMs.fill(0);
    if (this._active) this._active.fill(0);

    // Active-node metadata
    if (this._activeHz) this._activeHz.fill(0);
    if (this._activeBinPos) this._activeBinPos.fill(-1);
    this._activeCount = 0;
  }

  _recomputeAnalysisDbBounds() {
    // After A-weighting offsets are applied, dB values can legitimately fall outside
    // analyser.minDecibels/maxDecibels. We clamp to a stable extended range.
    if (this._aWeightingEnabled) {
      this._analysisMinDb = this._minDecibels + this._aWeightingMinDb;
      this._analysisMaxDb = this._maxDecibels + this._aWeightingMaxDb;
    } else {
      this._analysisMinDb = this._minDecibels;
      this._analysisMaxDb = this._maxDecibels;
    }
  }

  _computeAWeightingTable() {
    const table = this.aWeightingTable;
    if (!table) {
      this._aWeightingMinDb = 0;
      this._aWeightingMaxDb = 0;
      return;
    }

    const sr = this.sampleRate || 48000;
    const fft = this.fftSize || (this._analyser ? this._analyser.fftSize : this._fftSize);
    const hzPerBin = sr / fft;

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < table.length; i++) {
      const f = i * hzPerBin;
      let w = FeedbackDetector._aWeightingDb(f);
      if (!Number.isFinite(w)) w = -120;
      table[i] = w;
      if (w < min) min = w;
      if (w > max) max = w;
    }

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;

    this._aWeightingMinDb = min;
    this._aWeightingMaxDb = max;
  }

  _recomputeDerivedIndices() {
    const n = this._freqDb?.length ?? 0;
    if (!n) return;

    const sr = this.sampleRate || 48000;
    const fft = this.fftSize;

    const clampInt = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

    // Convert Hz -> bin index
    const hzToBin = (hz) => Math.round((hz * fft) / sr);

    let start = hzToBin(this._minFrequencyHz);
    let end = hzToBin(this._maxFrequencyHz);

    start = clampInt(start, 0, n - 1);
    end = clampInt(end, 0, n - 1);
    if (end < start) { const t = start; start = end; end = t; }

    // Clamp neighborhood bins to what the spectrum can support
    const nbMax = Math.floor((n - 3) / 2);
    const nb = Math.max(2, Math.min(this._neighborhoodBins | 0, nbMax));
    this._effectiveNb = nb;

    // Ensure we have room for full neighborhoods (and i±1 exclusion inside them)
    start = Math.max(start, nb);
    end = Math.min(end, n - 1 - nb);

    if (end < start) {
      // Empty range (no valid bins)
      this._startBin = 1;
      this._endBin = 0;
      this._noiseSampleIdx = new Uint32Array(0);
      this._noiseSamples = new Float32Array(0);
      return;
    }

    this._startBin = start;
    this._endBin = end;

    // Precompute noise-floor sample indices (evenly spaced in [start..end])
    const range = end - start + 1;
    const desired = Math.min(this._noiseFloorSampleCount, range);

    this._noiseSampleIdx = new Uint32Array(desired);
    this._noiseSamples = new Float32Array(desired);

    if (desired === 1) {
      this._noiseSampleIdx[0] = start;
      return;
    }

    const step = (range - 1) / (desired - 1);
    for (let i = 0; i < desired; i++) {
      const idx = start + Math.round(i * step);
      this._noiseSampleIdx[i] = clampInt(idx, start, end);
    }
  }

  _rafLoop(timestamp) {
    if (!this._isRunning) return;

    // Keep RAF alive even if AudioContext is suspended; we just skip analysis.
    const rafDt = (this._lastRafTs === 0) ? 0 : (timestamp - this._lastRafTs);
    this._lastRafTs = timestamp;

    // Guard against throttling (background tab, long GC pause, etc.)
    if (rafDt > this._maxAnalysisGapMs) {
      this._resetHistory();
      this._lastAnalysisTs = timestamp;
    }

    // Throttle analysis to analysisIntervalMs
    if (this._lastAnalysisTs === 0) {
      this._lastAnalysisTs = timestamp;
    }

    const since = timestamp - this._lastAnalysisTs;
    if (since >= this._analysisIntervalMs) {
      this._analyze(timestamp, since);
      this._lastAnalysisTs = timestamp;
    }

    this._rafId = requestAnimationFrame(this._rafLoop);
  }

  _analyze(now, dt) {
    const analyser = this._analyser;
    const ctx = this._audioContext;
    if (!analyser || !this._freqDb || !this._holdMs || !this._active) return;
    if (!ctx || ctx.state !== "running") return;

    // Read spectrum (dB)
    analyser.getFloatFrequencyData(this._freqDb);

    const freqDb = this._freqDb;
    const power = this._power;
    const prefix = this._prefix;

    const n = freqDb.length;

    // A-weighting toggle (optional)
    const useAWeighting = this._aWeightingEnabled && !!this.aWeightingTable;
    const aTable = this.aWeightingTable;

    const minDb = this._minDecibels;
    const maxDb = this._maxDecibels;
    const analysisMinDb = this._analysisMinDb;
    const analysisMaxDb = this._analysisMaxDb;

    // Build power + prefix sums (O(n))
    prefix[0] = 0;
    for (let i = 0; i < n; i++) {
      let db = freqDb[i];

      // Clamp raw analyser output to configured range first
      if (!Number.isFinite(db)) db = minDb;
      if (db < minDb) db = minDb;
      if (db > maxDb) db = maxDb;

      // Optional A-weighting (no allocations; precomputed lookup)
      if (useAWeighting) db += aTable[i];

      // Clamp in the weighted domain for numerical stability
      if (db < analysisMinDb) db = analysisMinDb;
      else if (db > analysisMaxDb) db = analysisMaxDb;

      // Optional: store sanitized value back (helps comparisons stay stable)
      freqDb[i] = db;

      // power = 10^(dB/10)
      const p = Math.pow(10, db * 0.1);
      power[i] = p;
      prefix[i + 1] = prefix[i] + p;
    }

    // Update noise floor after (optional) A-weighting so thresholds are in the same domain
    if (this._noiseFloorEnabled) {
      this._updateNoiseFloorDb(dt);
    }

    const effectiveThresholdDb = this._computeEffectiveThresholdDb();

    const nb = this._effectiveNb;
    const start = this._startBin;
    const end = this._endBin;
    if (end < start) return;

    const hold = this._holdMs;
    const dead = this._deadMs;
    const active = this._active;

    for (let i = start; i <= end; i++) {
      const peakDb = freqDb[i];

      // Local max check
      const leftDb = freqDb[i - 1];
      const rightDb = freqDb[i + 1];
      const isLocalMax =
        (peakDb >= leftDb && peakDb >= rightDb && (peakDb > leftDb || peakDb > rightDb));

      let valid = isLocalMax && (peakDb >= effectiveThresholdDb);
      let prominence = -Infinity;

      if (valid) {
        // Neighborhood [i-nb .. i+nb] inclusive => prefix(endExclusive) - prefix(start)
        const startNb = i - nb;
        const endNbExcl = i + nb + 1;

        // ---- CRITICAL MATH FIX: Blackman exclusion (±1 leakage) ----
        // totalPower = sum(range) - power[i-1] - power[i] - power[i+1]
        let totalPower = (prefix[endNbExcl] - prefix[startNb])
          - power[i - 1] - power[i] - power[i + 1];

        // count = (2*nb+1) - 3 = 2*nb - 2
        const count = (2 * nb - 2);

        if (totalPower < 0) totalPower = 0; // numerical safety

        const avgPower = (count > 0) ? (totalPower / count) : 0;
        const avgDb = (avgPower > 0) ? (10 * Math.log10(avgPower)) : analysisMinDb;

        prominence = peakDb - avgDb;
        if (prominence < this._prominenceDb) valid = false;
      }

      if (valid) {
        hold[i] += dt;
        dead[i] = 0;

        if (hold[i] >= this._sustainMs && active[i] === 0) {
          // ---- Upgrade 1: True Peak (Quadratic) interpolation ----
          // Parabolic interpolation around bin i using neighbors (i-1, i, i+1)
          // delta = 0.5*(a - c) / (a - 2b + c)
          // peak = b - 0.25*(a - c)*delta
          const a = leftDb;
          const b = peakDb;
          const c = rightDb;
          const denom = (a - 2 * b + c);

          let delta = 0;
          if (denom !== 0) {
            delta = 0.5 * (a - c) / denom;
            // Numerical guard: local maxima should live in [-0.5, 0.5]
            if (delta > 0.5) delta = 0.5;
            else if (delta < -0.5) delta = -0.5;
            if (!Number.isFinite(delta)) delta = 0;
          }

          const sr = ctx.sampleRate;
          const fft = analyser.fftSize;
          const hzPerBin = sr / fft;

          const trueFrequencyHz = (i + delta) * hzPerBin;

          let trueAmplitudeDb = b - 0.25 * (a - c) * delta;
          if (!Number.isFinite(trueAmplitudeDb)) trueAmplitudeDb = b;
          if (trueAmplitudeDb < analysisMinDb) trueAmplitudeDb = analysisMinDb;
          else if (trueAmplitudeDb > analysisMaxDb) trueAmplitudeDb = analysisMaxDb;

          // ---- Upgrade 2: Harmonic root detection ----
          // If new peak is ~integer multiple of any currently-active lower node,
          // tag payload with harmonicOfHz (otherwise null).
          let harmonicRootHz = 0;
          const activeBins = this._activeBins;
          const activeCount = this._activeCount | 0;
          const activeHz = this._activeHz;

          // Tolerance: ±1.5% of the expected multiple
          const tol = 0.015;
          const maxHarmonic = 8; // covers 2x..8x; adjust if you want deeper overtone tagging

          if (activeBins && activeHz && activeCount > 0) {
            for (let j = 0; j < activeCount; j++) {
              const rootBin = activeBins[j];
              const rootHz = activeHz[rootBin];
              if (!(rootHz > 0) || rootHz >= trueFrequencyHz) continue;

              const ratio = trueFrequencyHz / rootHz;
              const k = Math.round(ratio);
              if (k < 2 || k > maxHarmonic) continue;

              const expected = rootHz * k;
              const diff = trueFrequencyHz - expected;
              const absDiff = diff < 0 ? -diff : diff;

              if (absDiff <= expected * tol) {
                if (harmonicRootHz === 0 || rootHz < harmonicRootHz) {
                  harmonicRootHz = rootHz;
                }
              }
            }
          }

          // Mark active AFTER harmonic scan (so we don't match ourselves)
          active[i] = 1;

          // Cache the true frequency for harmonic comparisons + for cleared events
          if (this._activeHz) this._activeHz[i] = trueFrequencyHz;
          if (this._activeBins && this._activeBinPos) {
            const pos = this._activeCount | 0;
            this._activeBins[pos] = i;
            this._activeBinPos[i] = pos;
            this._activeCount = pos + 1;
          }

          // Allocate only when we actually trigger (not per frame)
          const payload = {
            binIndex: i,

            // Back-compat fields now upgraded to true (interpolated) values
            frequencyHz: trueFrequencyHz,
            levelDb: trueAmplitudeDb,

            // Explicit true-peak fields
            trueFrequencyHz,
            trueAmplitudeDb,

            // Harmonic tagging
            harmonicOfHz: harmonicRootHz !== 0 ? harmonicRootHz : null,

            prominenceDb: prominence,
            sustainedMs: hold[i],
            fftSize: fft,
            sampleRate: sr,
            noiseFloorDb: this._noiseFloorDb,
            effectiveThresholdDb,
            timestamp: now
          };

          try {
            if (typeof this.onFeedbackDetected === "function") this.onFeedbackDetected(payload);
          } catch (err) {
            console.error("FeedbackDetector onFeedbackDetected callback error:", err);
          }
        }
      } else {
        // invalid this analysis tick
        hold[i] = 0;

        if (active[i] === 1) {
          dead[i] += dt;

          // Clear only after sustained invalid to prevent chattering
          if (dead[i] >= this._clearMs) {
            // Preserve last known true frequency if we have it
            const clearedHz = (this._activeHz && this._activeHz[i] > 0)
              ? this._activeHz[i]
              : this.binToFrequency(i);

            active[i] = 0;
            dead[i] = 0;

            // Remove from active-bin list (swap-remove, O(1))
            if (this._activeBins && this._activeBinPos) {
              const pos = this._activeBinPos[i];
              if (pos >= 0) {
                const lastPos = (this._activeCount | 0) - 1;
                if (lastPos >= 0) {
                  const lastBin = this._activeBins[lastPos];
                  this._activeBins[pos] = lastBin;
                  this._activeBinPos[lastBin] = pos;
                  this._activeCount = lastPos;
                } else {
                  this._activeCount = 0;
                }
                this._activeBinPos[i] = -1;
              }
            }
            if (this._activeHz) this._activeHz[i] = 0;

            const payload = {
              binIndex: i,
              frequencyHz: clearedHz,
              fftSize: this.fftSize,
              sampleRate: this.sampleRate,
              timestamp: now
            };

            try {
              if (typeof this.onFeedbackCleared === "function") this.onFeedbackCleared(payload);
            } catch (err) {
              console.error("FeedbackDetector onFeedbackCleared callback error:", err);
            }
          }
        } else {
          dead[i] = 0;
        }
      }
    }
  }

  _updateNoiseFloorDb(dt) {
    const idx = this._noiseSampleIdx;
    const samples = this._noiseSamples;
    if (!idx || !samples || idx.length === 0) return;

    const freqDb = this._freqDb;

    const analysisMinDb = this._analysisMinDb;
    const analysisMaxDb = this._analysisMaxDb;

    // Gather samples (robust against single-bin squeals)
    for (let i = 0; i < idx.length; i++) {
      let db = freqDb[idx[i]];
      if (!Number.isFinite(db)) db = analysisMinDb;
      if (db < analysisMinDb) db = analysisMinDb;
      if (db > analysisMaxDb) db = analysisMaxDb;
      samples[i] = db;
    }

    // Median (in-place, no sort allocations)
    const estimateDb = FeedbackDetector._medianInPlace(samples);

    if (this._noiseFloorDb == null) {
      this._noiseFloorDb = estimateDb;
      return;
    }

    const current = this._noiseFloorDb;
    const tau = (estimateDb > current) ? this._noiseFloorAttackMs : this._noiseFloorReleaseMs;

    // alpha = 1 - exp(-dt/tau)
    const alpha = 1 - Math.exp(-dt / tau);
    this._noiseFloorDb = current + alpha * (estimateDb - current);
  }

  _computeEffectiveThresholdDb() {
    const absT = this._thresholdDb;

    // If noise floor disabled or not yet initialized, fall back to absolute threshold
    if (!this._noiseFloorEnabled || this._noiseFloorDb == null) return absT;

    const relT = this._noiseFloorDb + this._relativeThresholdDb;

    switch (this._thresholdMode) {
      case "absolute": return absT;
      case "relative": return relT;
      case "hybrid":   return Math.max(absT, relT);
      default:         return Math.max(absT, relT);
    }
  }

  // ---------------- Static helpers ----------------

  static _isValidFftSize(n) {
    return Number.isInteger(n) && n >= 32 && n <= 32768 && (n & (n - 1)) === 0;
  }

  /**
   * Standard A-weighting curve (IEC/CD 1672) as a dB offset.
   *
   * Returns the amount (in dB) to ADD to a spectrum magnitude at frequency fHz.
   *
   * Implementation is allocation-free and intended for offline table generation.
   */
  static _aWeightingDb(fHz) {
    // A(0) -> -inf; clamp to a large negative so the table remains finite.
    if (!(fHz > 0)) return -120;

    // Constants in Hz (standard rounded values)
    const f2 = fHz * fHz;

    const c1 = 20.6;
    const c2 = 107.7;
    const c3 = 737.9;
    const c4 = 12200;

    const c1_2 = c1 * c1;
    const c2_2 = c2 * c2;
    const c3_2 = c3 * c3;
    const c4_2 = c4 * c4;

    // RA(f) = (c4^2 * f^4) / ((f^2 + c1^2) * sqrt((f^2 + c2^2)(f^2 + c3^2)) * (f^2 + c4^2))
    // A(f) = 2.0 + 20*log10(RA(f))
    const num = c4_2 * (f2 * f2);
    const den = (f2 + c1_2)
      * (f2 + c4_2)
      * Math.sqrt((f2 + c2_2) * (f2 + c3_2));

    const ra = num / den;
    if (!(ra > 0) || !Number.isFinite(ra)) return -120;

    return 2.0 + 20.0 * Math.log10(ra);
  }

  /**
   * In-place median for a Float32Array (no allocations).
   * Uses quickselect; array order is not preserved.
   */
  static _medianInPlace(arr) {
    const len = arr.length;
    if (len === 0) return -Infinity;
    const mid = len >> 1;

    if (len & 1) {
      // odd
      return FeedbackDetector._quickselect(arr, mid);
    }

    // even: average of two middle elements
    const a = FeedbackDetector._quickselect(arr, mid - 1);
    const b = FeedbackDetector._quickselect(arr, mid);
    return 0.5 * (a + b);
  }

  static _quickselect(arr, k) {
    let left = 0;
    let right = arr.length - 1;

    while (right > left) {
      // Median-of-three pivot selection to reduce worst cases
      const mid = (left + right) >> 1;

      const a = arr[left];
      const b = arr[mid];
      const c = arr[right];

      let pivotIndex;
      if (a < b) {
        if (b < c) pivotIndex = mid;
        else pivotIndex = (a < c) ? right : left;
      } else {
        if (a < c) pivotIndex = left;
        else pivotIndex = (b < c) ? right : mid;
      }

      const pivotNewIndex = FeedbackDetector._partition(arr, left, right, pivotIndex);

      if (k === pivotNewIndex) return arr[k];
      if (k < pivotNewIndex) right = pivotNewIndex - 1;
      else left = pivotNewIndex + 1;
    }

    return arr[left];
  }

  static _partition(arr, left, right, pivotIndex) {
    const pivotValue = arr[pivotIndex];

    // Swap pivot to end
    let tmp = arr[pivotIndex];
    arr[pivotIndex] = arr[right];
    arr[right] = tmp;

    let storeIndex = left;

    for (let i = left; i < right; i++) {
      if (arr[i] < pivotValue) {
        tmp = arr[storeIndex];
        arr[storeIndex] = arr[i];
        arr[i] = tmp;
        storeIndex++;
      }
    }

    // Move pivot to its final place
    tmp = arr[right];
    arr[right] = arr[storeIndex];
    arr[storeIndex] = tmp;

    return storeIndex;
  }
}

export default FeedbackDetector;

/* ---------------- Example usage ----------------

const detector = new FeedbackDetector({
  fftSize: 2048,

  thresholdMode: "hybrid",
  thresholdDb: -40,
  relativeThresholdDb: 18,

  prominenceDb: 15,
  neighborhoodBins: 6, // >= 2

  sustainMs: 400,
  clearMs: 200,

  minFrequencyHz: 100,
  maxFrequencyHz: 12000,

  // Optional A-weighting
  aWeightingEnabled: true,

  onFeedbackDetected: (e) => {
    console.log(
      "FEEDBACK DETECTED",
      e.frequencyHz?.toFixed(2),
      "Hz",
      "harmonicOfHz:",
      e.harmonicOfHz ? e.harmonicOfHz.toFixed(2) : null,
      e
    );
  },
  onFeedbackCleared: (e) => {
    console.log("FEEDBACK CLEARED", e.frequencyHz?.toFixed(2), "Hz", e);
  }
});

// Must be called from a user gesture in most browsers
// await detector.start();
// detector.stop({ releaseMic: true });

-------------------------------------------------- */