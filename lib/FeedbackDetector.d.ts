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

  // Analysis cadence
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

export class FeedbackDetector {
  constructor(options?: FeedbackDetectorOptions)

  // Lifecycle
  start(arg?: MediaStream | StartArgsObject): Promise<void>
  stop(options?: StopOptions): void

  // Live setters
  setFftSize(fftSize: number): void
  setThresholdDb(thresholdDb: number): void
  setRelativeThresholdDb(relativeDb: number): void
  setThresholdMode(mode: ThresholdMode): void
  setProminenceDb(prominenceDb: number): void
  setSustainMs(ms: number): void
  setClearMs(ms: number): void
  setNeighborhoodBins(bins: number): void
  setFrequencyRange(minHz: number, maxHz: number): void
  setAnalysisIntervalMs(ms: number): void
  setNoiseFloorEnabled(enabled: boolean): void
  setNoiseFloorDb(db: number): void
  resetNoiseFloor(): void

  // Introspection (getters)
  get isRunning(): boolean
  get fftSize(): number
  get sampleRate(): number | null
  get noiseFloorDb(): number | null
  get effectiveThresholdDb(): number

  // Utilities
  binToFrequency(binIndex: number): number | null

  // Internal properties exposed for direct canvas reading
  _audioContext: AudioContext | null
  _source: MediaStreamAudioSourceNode | null
  readonly _analyser: AnalyserNode | null
  readonly _freqDb: Float32Array | null
  readonly _minDecibels: number
  readonly _maxDecibels: number
  _thresholdDb: number
  _relativeThresholdDb: number
}