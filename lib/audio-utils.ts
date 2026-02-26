import { AUDIO_CONSTANTS, FREQ_BANDS, SEVERITY_THRESHOLDS, ACOUSTIC_CONSTANTS } from "./constants.ts"

export function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(2)} kHz`
  return `${Math.round(freq)} Hz`
}

export function freqToNote(freq: number): string {
  const { NOTE_NAMES, A4_FREQ, SEMITONES_PER_OCTAVE, MIDI_A4 } = ACOUSTIC_CONSTANTS
  const semitones = SEMITONES_PER_OCTAVE * Math.log2(freq / A4_FREQ)
  const noteIndex = Math.round(semitones) + MIDI_A4
  const octave = Math.floor(noteIndex / SEMITONES_PER_OCTAVE) - 1
  const note = NOTE_NAMES[((noteIndex % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE]
  return `${note}${octave}`
}

export function getFreqBandLabel(freq: number): string {
  return FREQ_BANDS.find(b => freq < b.limit)?.label || "Air"
}

export function getFreqBandColor(freq: number): string {
  return FREQ_BANDS.find(b => freq < b.limit)?.color || "text-purple-400"
}

const getSeverity = (magnitude: number) =>
  SEVERITY_THRESHOLDS.find(s => magnitude > s.limit) || SEVERITY_THRESHOLDS[SEVERITY_THRESHOLDS.length - 1]

export function getSeverityLabel(magnitude: number): string {
  return getSeverity(magnitude).label
}

export function getSeverityColor(magnitude: number): string {
  return getSeverity(magnitude).color
}

export function getRecGain(magnitude: number): number {
  return getSeverity(magnitude).recGain
}

export function getRecQ(magnitude: number): number {
  return getSeverity(magnitude).recQ
}

/**
 * Visualization Math
 */

export function freqToX(freq: number, width: number): number {
  const minLog = Math.log10(AUDIO_CONSTANTS.MIN_FREQ)
  const maxLog = Math.log10(AUDIO_CONSTANTS.MAX_FREQ)
  const log = Math.log10(Math.max(freq, AUDIO_CONSTANTS.MIN_FREQ))
  return ((log - minLog) / (maxLog - minLog)) * width
}

export function xToFreq(x: number, width: number): number {
  const minLog = Math.log10(AUDIO_CONSTANTS.MIN_FREQ)
  const maxLog = Math.log10(AUDIO_CONSTANTS.MAX_FREQ)
  const log = minLog + (x / width) * (maxLog - minLog)
  return Math.pow(10, log)
}

export function dbToY(db: number, height: number, minDb: number = AUDIO_CONSTANTS.MIN_DB, maxDb: number = AUDIO_CONSTANTS.MAX_DB): number {
  return height - ((db - minDb) / (maxDb - minDb)) * height
}

export function yToDb(y: number, height: number, minDb: number = AUDIO_CONSTANTS.MIN_DB, maxDb: number = AUDIO_CONSTANTS.MAX_DB): number {
  return minDb + ((height - y) / height) * (maxDb - minDb)
}

/**
 * Frequency Relationships
 */

export function findFundamental(freq: number, allFreqs: number[]): number | null {
  const { HARMONIC_TOLERANCE_HZ, HARMONIC_MULTIPLIERS, HARMONIC_RATIO_MIN, HARMONIC_RATIO_MAX } = ACOUSTIC_CONSTANTS
  for (const other of allFreqs) {
    if (Math.abs(other - freq) < HARMONIC_TOLERANCE_HZ) continue
    for (const multiplier of HARMONIC_MULTIPLIERS) {
      const expected = other * multiplier
      const ratio = freq / expected
      if (ratio > HARMONIC_RATIO_MIN && ratio < HARMONIC_RATIO_MAX) {
        return other
      }
    }
  }
  return null
}
