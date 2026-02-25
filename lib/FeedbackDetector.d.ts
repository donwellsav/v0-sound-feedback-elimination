export interface FeedbackDetectedEvent {
  binIndex: number;
  frequencyHz: number;
  levelDb: number;
  prominenceDb: number;
  sustainedMs: number;
  fftSize: number;
  sampleRate: number;
  noiseFloorDb: number | null;
  effectiveThresholdDb: number;
  timestamp: number;
}

export interface FeedbackClearedEvent {
  binIndex: number;
}

export interface FeedbackDetectorOptions {
  fftSize?: number;
  thresholdMode?: "absolute" | "relative" | "hybrid";
  thresholdDb?: number;
  relativeThresholdDb?: number;
  prominenceDb?: number;
  neighborhoodBins?: number;
  sustainMs?: number;
  clearMs?: number;
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  analysisIntervalMs?: number;
  smoothingTimeConstant?: number;
  minDecibels?: number;
  maxDecibels?: number;
  noiseFloor?: {
    enabled?: boolean;
    sampleCount?: number;
    attackMs?: number;
    releaseMs?: number;
  };
  onFeedbackDetected?: (event: FeedbackDetectedEvent) => void;
  onFeedbackCleared?: (event: FeedbackClearedEvent) => void;
}

export class FeedbackDetector {
  constructor(options?: FeedbackDetectorOptions);

  // Lifecycle
  start(streamOrConstraints?: MediaStream | MediaStreamConstraints): Promise<void>;
  stop(options?: { releaseMic?: boolean }): void;

  // Live setters
  setFftSize(fftSize: number): void;
  setThresholdDb(thresholdDb: number): void;
  setRelativeThresholdDb(relativeDb: number): void;
  setThresholdMode(mode: "absolute" | "relative" | "hybrid"): void;
  setProminenceDb(prominenceDb: number): void;
  setSustainMs(ms: number): void;
  setClearMs(ms: number): void;
  setNeighborhoodBins(bins: number): void;
  setFrequencyRange(minHz: number, maxHz: number): void;
  setAnalysisIntervalMs(ms: number): void;
  setNoiseFloorEnabled(enabled: boolean): void;
  setNoiseFloorDb(db: number): void;
  resetNoiseFloor(): void;

  // Introspection (getters)
  readonly isRunning: boolean;
  readonly fftSize: number;
  readonly sampleRate: number | null;
  readonly noiseFloorDb: number | null;
  readonly effectiveThresholdDb: number;

  // Utilities
  binToFrequency(binIndex: number): number | null;

  // Internal properties exposed for direct canvas reading
  readonly _audioContext: AudioContext | null;
  readonly _source: MediaStreamAudioSourceNode | null;
  readonly _analyser: AnalyserNode | null;
  readonly _freqDb: Float32Array | null;
  readonly _minDecibels: number;
  readonly _maxDecibels: number;
  _thresholdDb: number;
  _relativeThresholdDb: number;
}
