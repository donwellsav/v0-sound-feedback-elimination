import { AUDIO_CONSTANTS } from "@/lib/constants"

export type ThresholdMode = "absolute" | "relative" | "hybrid"

export interface NoiseFloorOptions {
  enabled?: boolean
  sampleCount?: number
  attackMs?: number
  releaseMs?: number
}

export interface FeedbackDetectedEvent {
  binIndex: number
  frequencyHz: number | null
  levelDb: number
  prominenceDb: number
  sustainedMs: number
  fftSize: number
  sampleRate: number | null
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  timestamp: number
}

export interface FeedbackClearedEvent {
  binIndex: number
  frequencyHz: number | null
  fftSize: number
  sampleRate: number | null
  timestamp: number
}

export interface FeedbackDetectorOptions {
  // Core
  fftSize?: number

  // Thresholding
  thresholdMode?: ThresholdMode
  thresholdDb?: number
  relativeThresholdDb?: number

  // Peak validation
  prominenceDb?: number
  neighborhoodBins?: number

  // Time continuity
  sustainMs?: number
  clearMs?: number

  // Analysis cadence (RAF still runs each frame; analysis is throttled to this interval)
  analysisIntervalMs?: number

  // Frequency range
  minFrequencyHz?: number
  maxFrequencyHz?: number

  // Noise floor tracker
  noiseFloor?: NoiseFloorOptions

  // Analyser config
  minDecibels?: number
  maxDecibels?: number
  smoothingTimeConstant?: number

  // Callbacks
  onFeedbackDetected?: ((payload: FeedbackDetectedEvent) => void) | null
  onFeedbackCleared?: ((payload: FeedbackClearedEvent) => void) | null
}

export interface StartArgsObject {
  stream?: MediaStream | null
  audioContext?: AudioContext | null
  constraints?: MediaStreamConstraints | null
}

export interface StopOptions {
  releaseMic?: boolean
}

/**
 * FeedbackDetector -- Core Engine
 */
export class FeedbackDetector {
  // Callbacks
  public onFeedbackDetected: ((payload: FeedbackDetectedEvent) => void) | null
  public onFeedbackCleared: ((payload: FeedbackClearedEvent) => void) | null

  // Tunables
  private _fftSize: number
  public _thresholdMode: ThresholdMode
  public _thresholdDb: number
  public _relativeThresholdDb: number
  public _prominenceDb: number
  private _neighborhoodBins: number
  public _sustainMs: number
  private _clearMs: number
  private _analysisIntervalMs: number
  private _minFrequencyHz: number
  private _maxFrequencyHz: number
  private _noiseFloorEnabled: boolean
  private _noiseFloorSampleCount: number
  private _noiseFloorAttackMs: number
  private _noiseFloorReleaseMs: number
  public _minDecibels: number
  public _maxDecibels: number
  private _smoothingTimeConstant: number

  // Input gain (dB) -- applied via a GainNode between source and analyser
  public _inputGainDb: number

  // WebAudio objects
  public _audioContext: AudioContext | null = null
  private _stream: MediaStream | null = null
  public _source: MediaStreamAudioSourceNode | null = null
  public _gainNode: GainNode | null = null
  public _analyser: AnalyserNode | null = null

  // Buffers (preallocated)
  public _freqDb: Float32Array | null = null
  private _power: Float32Array | null = null
  private _prefix: Float64Array | null = null
  private _holdMs: Float32Array | null = null
  private _deadMs: Float32Array | null = null
  private _active: Uint8Array | null = null
  private _lastUpdateTs: Float64Array | null = null

  // Frequency bounds (bin indices)
  private _startBin: number = 1
  private _endBin: number = 0
  private _effectiveNb: number = 2

  // Noise floor sampling
  private _noiseFloorDb: number | null = null
  public _noiseFloorOverride: number | null = null
  private _noiseSampleIdx: Uint32Array | null = null
  private _noiseSamples: Float32Array | null = null

  // RAF loop state
  private _isRunning: boolean = false
  private _rafId: number = 0
  private _lastRafTs: number = 0
  private _lastAnalysisTs: number = 0
  private _maxAnalysisGapMs: number

  constructor(options: FeedbackDetectorOptions = {}) {
    this.onFeedbackDetected = options.onFeedbackDetected || null
    this.onFeedbackCleared = options.onFeedbackCleared || null

    this._fftSize = options.fftSize || AUDIO_CONSTANTS.DEFAULT_FFT
    this._thresholdMode = (options.thresholdMode as ThresholdMode) || "hybrid"
    this._thresholdDb = options.thresholdDb ?? AUDIO_CONSTANTS.DEFAULT_THRESHOLD_DB
    this._relativeThresholdDb = options.relativeThresholdDb ?? AUDIO_CONSTANTS.DEFAULT_RELATIVE_THRESHOLD_DB
    this._prominenceDb = options.prominenceDb ?? AUDIO_CONSTANTS.DEFAULT_PROMINENCE_DB
    this._neighborhoodBins = Math.max(2, (options.neighborhoodBins || AUDIO_CONSTANTS.DEFAULT_NEIGHBORHOOD_BINS) | 0)
    this._sustainMs = Math.max(0, options.sustainMs ?? AUDIO_CONSTANTS.DEFAULT_SUSTAIN_MS)
    this._clearMs = Math.max(0, options.clearMs ?? AUDIO_CONSTANTS.DEFAULT_CLEAR_MS)
    this._analysisIntervalMs = Math.max(1, (options.analysisIntervalMs || AUDIO_CONSTANTS.ANALYSIS_INTERVAL_MS) | 0)
    this._minFrequencyHz = Math.max(0, options.minFrequencyHz ?? AUDIO_CONSTANTS.DEFAULT_MIN_FREQ_HZ)
    this._maxFrequencyHz = Math.max(this._minFrequencyHz, options.maxFrequencyHz ?? AUDIO_CONSTANTS.DEFAULT_MAX_FREQ_HZ)

    this._noiseFloorEnabled = !!(options.noiseFloor?.enabled ?? true)
    this._noiseFloorSampleCount = Math.max(
      AUDIO_CONSTANTS.NOISE_FLOOR.MIN_SAMPLE_COUNT,
      (options.noiseFloor?.sampleCount ?? AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_SAMPLE_COUNT) | 0
    )
    this._noiseFloorAttackMs = Math.max(
      AUDIO_CONSTANTS.NOISE_FLOOR.MIN_ATTACK_MS,
      options.noiseFloor?.attackMs ?? AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_ATTACK_MS
    )
    this._noiseFloorReleaseMs = Math.max(
      AUDIO_CONSTANTS.NOISE_FLOOR.MIN_RELEASE_MS,
      options.noiseFloor?.releaseMs ?? AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_RELEASE_MS
    )

    this._minDecibels = options.minDecibels ?? AUDIO_CONSTANTS.MIN_DB
    this._maxDecibels = options.maxDecibels ?? 0
    this._smoothingTimeConstant = options.smoothingTimeConstant ?? 0
    this._inputGainDb = 0

    this._maxAnalysisGapMs = Math.max(2 * this._analysisIntervalMs, AUDIO_CONSTANTS.MAX_ANALYSIS_GAP_MS)
    this._rafLoop = this._rafLoop.bind(this)
  }

  async start(arg: MediaStream | StartArgsObject = {}) {
    if (this._isRunning) return

    let audioContext: AudioContext | null = null
    let stream: MediaStream | null = null
    let constraints: MediaStreamConstraints | null = null

    if (arg && typeof arg === "object" && "getTracks" in arg) {
      stream = arg as MediaStream
    } else if (arg && typeof arg === "object") {
      const obj = arg as StartArgsObject
      audioContext = obj.audioContext || null
      stream = obj.stream || null
      constraints = obj.constraints || null
    }

    if (!this._audioContext) {
      const Ctx = (typeof window !== "undefined"
        ? (window as any).AudioContext || (window as any).webkitAudioContext
        : null) as typeof AudioContext | null

      if (!Ctx && !audioContext) throw new Error("Web Audio API not supported.")
      this._audioContext = audioContext || (Ctx ? new Ctx() : null)
    }

    if (stream) {
      if (this._stream && this._stream !== stream) {
        for (const t of this._stream.getTracks()) t.stop()
      }
      this._stream = stream
    } else if (!this._stream) {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia() not supported.")
      }

      const defaultConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      }

      this._stream = await navigator.mediaDevices.getUserMedia(constraints || defaultConstraints)
    }

    if (!this._analyser && this._audioContext) {
      this._analyser = this._audioContext.createAnalyser()
      this._analyser.minDecibels = this._minDecibels
      this._analyser.maxDecibels = this._maxDecibels
      this._analyser.smoothingTimeConstant = this._smoothingTimeConstant
    }

    this.setFftSize(this._fftSize)

    if (this._source) {
      try {
        this._source.disconnect()
      } catch (_) {}
      this._source = null
    }

    if (this._stream && this._audioContext) {
      this._source = this._audioContext.createMediaStreamSource(this._stream)
    }

    if (!this._gainNode && this._audioContext) {
      this._gainNode = this._audioContext.createGain()
    }

    if (this._gainNode && this._source && this._analyser) {
      this._gainNode.gain.value = Math.pow(10, this._inputGainDb / 20)
      this._source.connect(this._gainNode)
      this._gainNode.connect(this._analyser)
    }

    if (this._audioContext && this._audioContext.state !== "running") {
      await this._audioContext.resume()
    }

    this._isRunning = true
    this._lastRafTs = 0
    this._lastAnalysisTs = 0
    this._rafId = requestAnimationFrame(this._rafLoop)
  }

  stop({ releaseMic = false }: StopOptions = {}) {
    this._isRunning = false

    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = 0
    }

    this._lastRafTs = 0
    this._lastAnalysisTs = 0
    this._resetHistory()

    if (this._source) {
      try {
        this._source.disconnect()
      } catch (_) {}
      this._source = null
    }

    if (this._gainNode) {
      try {
        this._gainNode.disconnect()
      } catch (_) {}
      this._gainNode = null
    }

    if (releaseMic && this._stream) {
      for (const t of this._stream.getTracks()) t.stop()
      this._stream = null
    }
  }

  setFftSize(fftSize: number) {
    if (!FeedbackDetector._isValidFftSize(fftSize)) {
      throw new Error("fftSize must be a power of two between 32 and 32768.")
    }
    this._fftSize = fftSize

    if (this._analyser) {
      this._analyser.fftSize = fftSize
      this._allocateBuffers()
      this._resetHistory()
    }
  }

  setInputGainDb(db: number) {
    this._inputGainDb = db
    if (this._gainNode) {
      this._gainNode.gain.setTargetAtTime(
        Math.pow(10, db / 20),
        this._gainNode.context.currentTime,
        AUDIO_CONSTANTS.GAIN_RAMP_TIME
      )
    }
  }

  setThresholdDb(db: number) {
    this._thresholdDb = db
  }
  setRelativeThresholdDb(db: number) {
    this._relativeThresholdDb = db
  }
  setNoiseFloorDb(db: number) {
    this._noiseFloorOverride = db
    this._noiseFloorDb = db
  }
  resetNoiseFloor() {
    this._noiseFloorOverride = null
  }

  setThresholdMode(mode: ThresholdMode) {
    const m = String(mode) as ThresholdMode
    if (m !== "absolute" && m !== "relative" && m !== "hybrid") {
      throw new Error('thresholdMode must be "absolute", "relative", or "hybrid".')
    }
    this._thresholdMode = m
  }

  setProminenceDb(prominenceDb: number) {
    this._prominenceDb = prominenceDb
  }

  setSustainMs(ms: number) {
    this._sustainMs = Math.max(0, ms)
    this._resetHistory()
  }

  setClearMs(ms: number) {
    this._clearMs = Math.max(0, ms)
  }

  setNeighborhoodBins(bins: number) {
    this._neighborhoodBins = Math.max(2, bins | 0)
    this._recomputeDerivedIndices()
    this._resetHistory()
  }

  setFrequencyRange(minHz: number, maxHz: number) {
    this._minFrequencyHz = Math.max(0, minHz)
    this._maxFrequencyHz = Math.max(this._minFrequencyHz, maxHz)
    this._recomputeDerivedIndices()
    this._resetHistory()
  }

  setAnalysisIntervalMs(ms: number) {
    this._analysisIntervalMs = Math.max(1, ms | 0)
    this._maxAnalysisGapMs = Math.max(2 * this._analysisIntervalMs, 120)
    this._resetHistory()
  }

  setNoiseFloorEnabled(enabled: boolean) {
    this._noiseFloorEnabled = !!enabled
    if (!enabled) {
      this._noiseFloorDb = null
      this._noiseFloorOverride = null
    }
  }

  get isRunning() {
    return this._isRunning
  }
  get fftSize() {
    return this._analyser ? this._analyser.fftSize : this._fftSize
  }
  get sampleRate() {
    return this._audioContext?.sampleRate ?? null
  }
  get noiseFloorDb() {
    return this._noiseFloorDb
  }

  get effectiveThresholdDb() {
    return this._computeEffectiveThresholdDb()
  }

  binToFrequency(binIndex: number) {
    const sr = this.sampleRate
    const fft = this.fftSize
    if (!sr || !fft) return null
    return (binIndex * sr) / fft
  }

  private _allocateBuffers() {
    const analyser = this._analyser
    if (!analyser) return

    const n = analyser.frequencyBinCount

    this._freqDb = new Float32Array(n)
    this._power = new Float32Array(n)
    this._prefix = new Float64Array(n + 1)

    this._holdMs = new Float32Array(n)
    this._deadMs = new Float32Array(n)
    this._active = new Uint8Array(n)
    this._lastUpdateTs = new Float64Array(n)

    if (this._noiseFloorOverride == null) {
      this._noiseFloorDb = null
    }

    this._recomputeDerivedIndices()
  }

  private _resetHistory() {
    if (this._holdMs) this._holdMs.fill(0)
    if (this._deadMs) this._deadMs.fill(0)
    if (this._active) this._active.fill(0)
    if (this._lastUpdateTs) this._lastUpdateTs.fill(0)
  }

  private _recomputeDerivedIndices() {
    const n = this._freqDb?.length ?? 0
    if (!n) return

    const sr = this.sampleRate || AUDIO_CONSTANTS.DEFAULT_SAMPLE_RATE
    const fft = this.fftSize

    // 1. Calculate and clamp basic bin range from frequencies
    const hzToBin = (hz: number) => Math.round((hz * fft) / sr)
    let start = hzToBin(this._minFrequencyHz)
    let end = hzToBin(this._maxFrequencyHz)

    if (start > end) [start, end] = [end, start]

    start = Math.max(0, Math.min(start, n - 1))
    end = Math.max(0, Math.min(end, n - 1))

    // 2. Determine effective neighborhood size
    const nbMax = Math.floor((n - 3) / 2)
    this._effectiveNb = Math.max(2, Math.min(this._neighborhoodBins | 0, nbMax))

    // 3. Restrict range based on neighborhood constraints
    this._startBin = Math.max(start, this._effectiveNb)
    this._endBin = Math.min(end, n - 1 - this._effectiveNb)

    // 4. Initialize noise floor sampling
    this._initNoiseFloorBuffers()
  }

  private _initNoiseFloorBuffers() {
    const start = this._startBin
    const end = this._endBin
    const range = end - start + 1

    if (range <= 0) {
      this._startBin = 1
      this._endBin = 0
      this._noiseSampleIdx = new Uint32Array(0)
      this._noiseSamples = new Float32Array(0)
      return
    }

    const desired = Math.min(this._noiseFloorSampleCount, range)
    this._noiseSampleIdx = new Uint32Array(desired)
    this._noiseSamples = new Float32Array(desired)

    if (desired === 1) {
      this._noiseSampleIdx[0] = start
    } else {
      const step = (range - 1) / (desired - 1)
      for (let i = 0; i < desired; i++) {
        this._noiseSampleIdx[i] = Math.round(start + i * step)
      }
    }
  }

  private _rafLoop(timestamp: number) {
    if (!this._isRunning) return

    const rafDt = this._lastRafTs === 0 ? 0 : timestamp - this._lastRafTs
    this._lastRafTs = timestamp

    if (rafDt > this._maxAnalysisGapMs) {
      this._resetHistory()
      this._lastAnalysisTs = timestamp
    }

    if (this._lastAnalysisTs === 0) {
      this._lastAnalysisTs = timestamp
    }

    const since = timestamp - this._lastAnalysisTs
    if (since >= this._analysisIntervalMs) {
      this._analyze(timestamp, since)
      this._lastAnalysisTs = timestamp
    }

    this._rafId = requestAnimationFrame(this._rafLoop)
  }

  private _analyze(now: number, dt: number) {
    const analyser = this._analyser
    const ctx = this._audioContext
    if (!analyser || !this._freqDb || !this._holdMs || !this._active) return
    if (!ctx || ctx.state !== "running") return

    analyser.getFloatFrequencyData(this._freqDb)

    if (this._noiseFloorEnabled) {
      this._updateNoiseFloorDb(dt)
    }

    const effectiveThresholdDb = this._computeEffectiveThresholdDb()
    const freqDb = this._freqDb
    const power = this._power
    const prefix = this._prefix

    if (!power || !prefix) return

    const n = freqDb.length
    prefix[0] = 0
    for (let i = 0; i < n; i++) {
      let db = freqDb[i]
      if (!Number.isFinite(db)) db = this._minDecibels
      if (db < this._minDecibels) db = this._minDecibels
      if (db > this._maxDecibels) db = this._maxDecibels
      freqDb[i] = db
      const p = Math.pow(10, db * 0.1)
      power[i] = p
      prefix[i + 1] = prefix[i] + p
    }

    const nb = this._effectiveNb
    const start = this._startBin
    const end = this._endBin
    if (end < start) return

    const hold = this._holdMs
    const dead = this._deadMs
    const active = this._active

    if (!hold || !dead || !active || !this._lastUpdateTs) return

    for (let i = start; i <= end; i++) {
      const peakDb = freqDb[i]
      const leftDb = freqDb[i - 1]
      const rightDb = freqDb[i + 1]
      const isLocalMax = peakDb >= leftDb && peakDb >= rightDb && (peakDb > leftDb || peakDb > rightDb)

      let valid = isLocalMax && peakDb >= effectiveThresholdDb
      let prominence = -Infinity

      if (valid) {
        const startNb = i - nb
        const endNbExcl = i + nb + 1
        let totalPower = prefix[endNbExcl] - prefix[startNb] - power[i - 1] - power[i] - power[i + 1]
        const count = 2 * nb - 2
        if (totalPower < 0) totalPower = 0
        const avgPower = count > 0 ? totalPower / count : 0
        const avgDb = avgPower > 0 ? 10 * Math.log10(avgPower) : this._minDecibels
        prominence = peakDb - avgDb
        if (prominence < this._prominenceDb) valid = false
      }

      if (valid) {
        hold[i] += dt
        dead[i] = 0

        if (hold[i] >= this._sustainMs) {
          const isNewDetection = active[i] === 0
          if (isNewDetection) active[i] = 1

          const shouldUpdate = isNewDetection || now - this._lastUpdateTs[i] >= AUDIO_CONSTANTS.DETECTION_UPDATE_INTERVAL_MS

          if (shouldUpdate) {
            this._lastUpdateTs[i] = now
            const payload: FeedbackDetectedEvent = {
              binIndex: i,
              frequencyHz: this.binToFrequency(i),
              levelDb: peakDb,
              prominenceDb: prominence,
              sustainedMs: hold[i],
              fftSize: this.fftSize,
              sampleRate: this.sampleRate,
              noiseFloorDb: this._noiseFloorDb,
              effectiveThresholdDb,
              timestamp: now,
            }
            try {
              if (typeof this.onFeedbackDetected === "function") this.onFeedbackDetected(payload)
            } catch (err) {
              console.error("FeedbackDetector onFeedbackDetected callback error:", err)
            }
          }
        }
      } else {
        hold[i] = 0
        if (active[i] === 1) {
          dead[i] += dt
          if (dead[i] >= this._clearMs) {
            active[i] = 0
            dead[i] = 0
            const payload: FeedbackClearedEvent = {
              binIndex: i,
              frequencyHz: this.binToFrequency(i),
              fftSize: this.fftSize,
              sampleRate: this.sampleRate,
              timestamp: now,
            }
            try {
              if (typeof this.onFeedbackCleared === "function") this.onFeedbackCleared(payload)
            } catch (err) {
              console.error("FeedbackDetector onFeedbackCleared callback error:", err)
            }
          }
        } else {
          dead[i] = 0
        }
      }
    }
  }

  private _updateNoiseFloorDb(dt: number) {
    if (this._noiseFloorOverride != null) return
    const idx = this._noiseSampleIdx
    const samples = this._noiseSamples
    if (!idx || !samples || idx.length === 0 || !this._freqDb) return

    const freqDb = this._freqDb
    for (let i = 0; i < idx.length; i++) {
      let db = freqDb[idx[i]]
      if (!Number.isFinite(db)) db = this._minDecibels
      if (db < this._minDecibels) db = this._minDecibels
      if (db > this._maxDecibels) db = this._maxDecibels
      samples[i] = db
    }

    const estimateDb = FeedbackDetector._medianInPlace(samples)
    if (this._noiseFloorDb == null) {
      this._noiseFloorDb = estimateDb
      return
    }

    const current = this._noiseFloorDb
    const tau = estimateDb > current ? this._noiseFloorAttackMs : this._noiseFloorReleaseMs
    const alpha = 1 - Math.exp(-dt / tau)
    this._noiseFloorDb = current + alpha * (estimateDb - current)
  }

  private _computeEffectiveThresholdDb() {
    const absT = this._thresholdDb
    if (!this._noiseFloorEnabled || this._noiseFloorDb == null) return absT
    const relT = this._noiseFloorDb + this._relativeThresholdDb
    switch (this._thresholdMode) {
      case "absolute":
        return absT
      case "relative":
        return relT
      case "hybrid":
      default:
        return Math.max(absT, relT)
    }
  }

  private static _isValidFftSize(n: number) {
    return Number.isInteger(n) && n >= 32 && n <= 32768 && (n & (n - 1)) === 0
  }

  private static _medianInPlace(arr: Float32Array) {
    const len = arr.length
    if (len === 0) return -Infinity
    const mid = len >> 1
    if (len & 1) {
      return FeedbackDetector._quickselect(arr, mid)
    }
    const a = FeedbackDetector._quickselect(arr, mid - 1)
    const b = FeedbackDetector._quickselect(arr, mid)
    return 0.5 * (a + b)
  }

  private static _quickselect(arr: Float32Array, k: number): number {
    let left = 0
    let right = arr.length - 1
    while (right > left) {
      const mid = (left + right) >> 1
      const a = arr[left]
      const b = arr[mid]
      const c = arr[right]
      let pivotIndex
      if (a < b) {
        if (b < c) pivotIndex = mid
        else pivotIndex = a < c ? right : left
      } else {
        if (a < c) pivotIndex = left
        else pivotIndex = b < c ? right : mid
      }
      const pivotNewIndex = FeedbackDetector._partition(arr, left, right, pivotIndex)
      if (k === pivotNewIndex) return arr[k]
      if (k < pivotNewIndex) right = pivotNewIndex - 1
      else left = pivotNewIndex + 1
    }
    return arr[left]
  }

  private static _partition(arr: Float32Array, left: number, right: number, pivotIndex: number) {
    const pivotValue = arr[pivotIndex]
    let tmp = arr[pivotIndex]
    arr[pivotIndex] = arr[right]
    arr[right] = tmp
    let storeIndex = left
    for (let i = left; i < right; i++) {
      if (arr[i] < pivotValue) {
        tmp = arr[storeIndex]
        arr[storeIndex] = arr[i]
        arr[i] = tmp
        storeIndex++
      }
    }
    tmp = arr[right]
    arr[right] = arr[storeIndex]
    arr[storeIndex] = tmp
    return storeIndex
  }
}
