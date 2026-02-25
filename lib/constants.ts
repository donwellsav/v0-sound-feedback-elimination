export const AUDIO_CONSTANTS = {
  MIN_DB: -100,
  MAX_DB: -10,
  DEFAULT_FFT: 2048,
  MIN_FREQ: 20,
  MAX_FREQ: 20000,
  DEFAULT_MIN_FREQ_HZ: 80,
  DEFAULT_MAX_FREQ_HZ: 12000,
  DEFAULT_SUSTAIN_MS: 400,
  DEFAULT_CLEAR_MS: 200,
  DEFAULT_PROMINENCE_DB: 15,
  DEFAULT_THRESHOLD_DB: -35,
  DEFAULT_RELATIVE_THRESHOLD_DB: 20,
  DEFAULT_NEIGHBORHOOD_BINS: 6,
  GRID_FREQUENCIES: [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000],
  GRID_DB_VALUES: [-80, -60, -40, -20, 0],
  UI_THROTTLE_MS: 60,
  ANALYSIS_INTERVAL_MS: 25,
  // Newly homed
  DEFAULT_SAMPLE_RATE: 48000,
  PEAK_HOLD_DECAY_DB: 0.3,
  GAIN_RAMP_TIME: 0.02,
  MAX_ANALYSIS_GAP_MS: 120,
  DETECTION_UPDATE_INTERVAL_MS: 500,
  NOISE_FLOOR: {
    DEFAULT_SAMPLE_COUNT: 192,
    DEFAULT_ATTACK_MS: 250,
    DEFAULT_RELEASE_MS: 1200,
    MIN_SAMPLE_COUNT: 32,
    MIN_ATTACK_MS: 20,
    MIN_RELEASE_MS: 50,
  }
} as const

export const DETECTION_CONSTANTS = {
  MERGE_RATIO_MIN: 0.92,
  MERGE_RATIO_MAX: 1.08,
  HISTORY_CLEANUP_INTERVAL_MS: 1000,
  HIT_COUNT_CAP: 99,
} as const

export const VISUAL_CONSTANTS = {
  PULSE_SIZE_BASE: 6,
  PULSE_SIZE_VARIATION: 3,
  GLOW_SCALE: 3,
  HISTORICAL_MARKER_SIZE: 8,
  HISTORICAL_MARKER_CORE_SIZE: 3.5,
  GRAB_ZONE_PX: 20,
  PULSE_INTERVAL_MS: 1000,
  COLORS: {
    SPECTRUM_PEAK: "rgba(0, 200, 120, 0.3)",
    SPECTRUM_MAIN: "rgba(0, 220, 130, 0.9)",
    FEEDBACK_GLOW: "rgba(255, 60, 40, 0.6)",
    FEEDBACK_CORE: "rgba(255, 70, 50, 0.9)",
    HISTORICAL_STROKE: "rgba(255, 180, 50, 0.35)",
    HISTORICAL_FILL: "rgba(255, 180, 50, 0.7)",
    THRESHOLD_LINE: "rgba(255, 180, 50, 0.6)",
    FLOOR_LINE: "rgba(80, 160, 255, 0.6)",
    GRADIENT: [
      { stop: 0, color: "rgba(255, 80, 50, 0.8)" },
      { stop: 0.3, color: "rgba(255, 160, 50, 0.5)" },
      { stop: 0.6, color: "rgba(0, 200, 120, 0.3)" },
      { stop: 1, color: "rgba(0, 200, 120, 0.05)" },
    ],
  },
  LINE_STYLES: {
    CROSSHAIR: [4, 4],
    DIAGNOSTIC_PRIMARY: [6, 4],
    DIAGNOSTIC_SECONDARY: [10, 5],
  }
} as const

export const UI_CONSTANTS = {
  MOBILE_BREAKPOINT: 768,
  TOAST_REMOVE_DELAY: 1000000,
} as const

export const DEFAULT_SETTINGS = {
  historyRetention: 0,
  showPeakHold: true,
  clearOnStart: true,
} as const

export const FREQ_BANDS = [
  { limit: 100, label: "Sub Bass", color: "text-blue-400" },
  { limit: 250, label: "Bass", color: "text-blue-400" },
  { limit: 500, label: "Mud", color: "text-amber-400" },
  { limit: 1000, label: "Body", color: "text-amber-400" },
  { limit: 2000, label: "Honk", color: "text-orange-400" },
  { limit: 4000, label: "Presence", color: "text-orange-400" },
  { limit: 6000, label: "Bite", color: "text-red-400" },
  { limit: 8000, label: "Sibilance", color: "text-red-400" },
  { limit: 12000, label: "Brilliance", color: "text-purple-400" },
  { limit: Infinity, label: "Air", color: "text-purple-400" },
] as const

export const SEVERITY_THRESHOLDS = [
  { limit: -15, label: "CRIT", color: "text-feedback-critical", recGain: -18, recQ: 40 },
  { limit: -25, label: "HIGH", color: "text-feedback-danger", recGain: -12, recQ: 30 },
  { limit: -35, label: "MED", color: "text-feedback-warning", recGain: -8, recQ: 20 },
  { limit: -Infinity, label: "LOW", color: "text-primary", recGain: -8, recQ: 20 },
] as const
