import { AUDIO_CONSTANTS, FREQ_BANDS, SEVERITY_THRESHOLDS } from "./constants"

export function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(2)} kHz`
  return `${Math.round(freq)} Hz`
}

export function freqToNote(freq: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const a4 = 440
  const semitones = 12 * Math.log2(freq / a4)
  const noteIndex = Math.round(semitones) + 69
  const octave = Math.floor(noteIndex / 12) - 1
  const note = noteNames[((noteIndex % 12) + 12) % 12]
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

export function dbToY(db: number, height: number, minDb = AUDIO_CONSTANTS.MIN_DB, maxDb = AUDIO_CONSTANTS.MAX_DB): number {
  return height - ((db - minDb) / (maxDb - minDb)) * height
}

export function yToDb(y: number, height: number, minDb = AUDIO_CONSTANTS.MIN_DB, maxDb = AUDIO_CONSTANTS.MAX_DB): number {
  return minDb + ((height - y) / height) * (maxDb - minDb)
}

/**
 * Frequency Relationships
 */

export function findFundamental(freq: number, allFreqs: number[]): number | null {
  for (const other of allFreqs) {
    if (Math.abs(other - freq) < 5) continue
    for (const multiplier of [2, 3, 4]) {
      const expected = other * multiplier
      const ratio = freq / expected
      if (ratio > 0.97 && ratio < 1.03) {
        return other
      }
    }
  }
  return null
}
