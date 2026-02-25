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
  if (freq < 100) return "Sub Bass"
  if (freq < 250) return "Bass"
  if (freq < 500) return "Mud"
  if (freq < 1000) return "Body"
  if (freq < 2000) return "Honk"
  if (freq < 4000) return "Presence"
  if (freq < 6000) return "Bite"
  if (freq < 8000) return "Sibilance"
  if (freq < 12000) return "Brilliance"
  return "Air"
}

export function getFreqBandColor(freq: number): string {
  if (freq < 250) return "text-blue-400"
  if (freq < 1000) return "text-amber-400"
  if (freq < 4000) return "text-orange-400"
  if (freq < 8000) return "text-red-400"
  return "text-purple-400"
}

export function getSeverityLabel(magnitude: number): string {
  if (magnitude > -15) return "CRIT"
  if (magnitude > -25) return "HIGH"
  if (magnitude > -35) return "MED"
  return "LOW"
}

export function getSeverityColor(magnitude: number): string {
  if (magnitude > -15) return "text-feedback-critical"
  if (magnitude > -25) return "text-feedback-danger"
  if (magnitude > -35) return "text-feedback-warning"
  return "text-primary"
}

export function getRecGain(magnitude: number): number {
  if (magnitude > -15) return -18
  if (magnitude > -25) return -12
  return -8
}

export function getRecQ(magnitude: number): number {
  if (magnitude > -15) return 40
  if (magnitude > -25) return 30
  return 20
}
