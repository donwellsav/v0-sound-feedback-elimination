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

export default class FeedbackDetector {
  constructor(options?: FeedbackDetectorOptions)

  // Used by hooks/use-audio-engine.ts (existing codebase pattern)
  _audioContext: AudioContext | null
  _source: MediaStreamAudioSourceNode | null

  // Lifecycle
  start(arg?: MediaStream | StartArgsObject): Promise<void>
  stop(options?: StopOptions): void

  // Live updates
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

  // Introspection
  get isRunning(): boolean
  get fftSize(): number
  get sampleRate(): number | null
  get noiseFloorDb(): number | null
  get effectiveThresholdDb(): number

  binToFrequency(binIndex: number): number | null
}
