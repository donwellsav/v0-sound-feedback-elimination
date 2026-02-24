"use client"

import { Button } from "@/components/ui/button"
import { X, CirclePlus } from "lucide-react"
import type { FeedbackDetection, HistoricalDetection } from "@/hooks/use-audio-engine"

function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(2)} kHz`
  return `${Math.round(freq)} Hz`
}

function getMusicalNote(freq: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const a4 = 440
  const semitones = 12 * Math.log2(freq / a4)
  const noteIndex = Math.round(semitones) + 69
  const octave = Math.floor(noteIndex / 12) - 1
  const note = noteNames[((noteIndex % 12) + 12) % 12]
  return `${note}${octave}`
}

function getFreqBandLabel(freq: number): string {
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

function getFreqBandColor(freq: number): string {
  if (freq < 250) return "text-blue-400"
  if (freq < 1000) return "text-amber-400"
  if (freq < 4000) return "text-orange-400"
  if (freq < 8000) return "text-red-400"
  return "text-purple-400"
}

/**
 * Check if a frequency is a likely harmonic of another detected frequency.
 * Returns the fundamental frequency if this is a harmonic, null otherwise.
 */
function findFundamental(freq: number, allDetections: HistoricalDetection[]): number | null {
  for (const other of allDetections) {
    if (Math.abs(other.frequency - freq) < 5) continue // skip self
    // Check if freq is ~2x, 3x, or 4x of another detection
    for (const multiplier of [2, 3, 4]) {
      const expected = other.frequency * multiplier
      const ratio = freq / expected
      if (ratio > 0.97 && ratio < 1.03) {
        return other.frequency
      }
    }
  }
  return null
}

function getSeverityLabel(magnitude: number): string {
  if (magnitude > -15) return "CRIT"
  if (magnitude > -25) return "HIGH"
  if (magnitude > -35) return "MED"
  return "LOW"
}

function getSeverityColor(magnitude: number): string {
  if (magnitude > -15) return "text-feedback-critical"
  if (magnitude > -25) return "text-feedback-danger"
  if (magnitude > -35) return "text-feedback-warning"
  return "text-primary"
}

function getSeverityBorder(magnitude: number, isActive: boolean): string {
  if (!isActive) return "border-border/50"
  if (magnitude > -15) return "border-feedback-critical/30"
  if (magnitude > -25) return "border-feedback-danger/30"
  return "border-feedback-warning/20"
}

function getRecGain(magnitude: number): number {
  if (magnitude > -15) return -18
  return -10
}

function getRecQ(magnitude: number): number {
  if (magnitude > -15) return 40
  return 25
}

interface TelemetryRowProps {
  detection: HistoricalDetection
  allDetections: HistoricalDetection[]
  onDismiss: (id: string) => void
  onAddFilter: (frequency: number) => void
}

function TelemetryRow({ detection, allDetections, onDismiss, onAddFilter }: TelemetryRowProps) {
  const isActive = detection.isActive
  const gain = getRecGain(detection.peakMagnitude)
  const q = getRecQ(detection.peakMagnitude)
  const bandLabel = getFreqBandLabel(detection.frequency)
  const bandColor = getFreqBandColor(detection.frequency)
  const fundamental = findFundamental(detection.frequency, allDetections)

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-4 py-3 transition-colors ${getSeverityBorder(
        detection.peakMagnitude,
        isActive
      )} ${isActive ? "bg-secondary/50" : "bg-secondary/20 opacity-80"}`}
    >
      {/* Top row: status + frequency + actions */}
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isActive ? "bg-feedback-danger animate-pulse" : "bg-muted-foreground/40"
          }`}
        />

        {/* Severity tag */}
        <span
          className={`font-mono text-xs font-bold uppercase w-10 shrink-0 ${
            isActive ? getSeverityColor(detection.peakMagnitude) : "text-muted-foreground"
          }`}
        >
          {isActive ? getSeverityLabel(detection.magnitude) : "STALE"}
        </span>

        {/* Frequency -- hero element */}
        <span
          className={`font-mono text-lg font-bold tabular-nums shrink-0 ${
            isActive ? getSeverityColor(detection.peakMagnitude) : "text-foreground/70"
          }`}
        >
          {formatFreq(detection.frequency)}
        </span>

        {/* Musical note */}
        <span className="font-mono text-xs text-muted-foreground shrink-0">
          {getMusicalNote(detection.frequency)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add to recommended cuts */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
          onClick={() => onAddFilter(detection.frequency)}
          aria-label={`Add recommendation for ${formatFreq(detection.frequency)}`}
        >
          <CirclePlus className="h-4 w-4" />
        </Button>

        {/* Dismiss */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => onDismiss(detection.id)}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Bottom row: metadata */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 pl-[22px]">
        {/* Band label */}
        <span className={`font-mono text-xs font-medium uppercase tracking-wide ${bandColor}`}>
          {bandLabel}
        </span>

        {/* Harmonic indicator */}
        {fundamental && (
          <span className="font-mono text-xs font-medium text-purple-400 bg-purple-400/15 px-1.5 py-0.5 rounded">
            H of {fundamental >= 1000 ? `${(fundamental / 1000).toFixed(1)}k` : `${Math.round(fundamental)}`}
          </span>
        )}

        {/* Recommended cut */}
        <span className="font-mono text-xs tabular-nums">
          <span className="text-muted-foreground">Cut</span>{" "}
          <span className="text-foreground font-medium">{gain} dB</span>
        </span>

        {/* Recommended Q */}
        <span className="font-mono text-xs tabular-nums">
          <span className="text-muted-foreground">Q</span>{" "}
          <span className="text-foreground font-medium">{q}</span>
        </span>

        {/* Peak level */}
        <span className="font-mono text-xs tabular-nums">
          <span className="text-muted-foreground">Peak</span>{" "}
          <span className="text-foreground/80">{detection.peakMagnitude.toFixed(0)} dB</span>
        </span>

        {/* Hit count */}
        {detection.hitCount > 1 && (
          <span className="font-mono text-xs text-foreground/70 bg-secondary/80 px-1.5 py-0.5 rounded tabular-nums">
            {detection.hitCount}x
          </span>
        )}
      </div>
    </div>
  )
}

interface TelemetryPanelProps {
  detections: FeedbackDetection[]
  history: HistoricalDetection[]
  onAddFilter: (frequency: number) => void
  onDismiss: (id: string) => void
  isActive: boolean
}

export function TelemetryPanel({
  history,
  onAddFilter,
  onDismiss,
  isActive,
}: TelemetryPanelProps) {
  if (!isActive && history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-muted-foreground text-sm font-sans">Waiting for audio input</div>
        <div className="text-muted-foreground/50 text-xs font-sans mt-1">
          Start the engine to detect feedback
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-8 h-8 rounded-full border border-primary/20 flex items-center justify-center mb-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="text-primary text-sm font-medium font-sans">No feedback detected</div>
        <div className="text-muted-foreground/50 text-xs font-sans mt-1">System is clean</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((det) => (
        <TelemetryRow
          key={det.id}
          detection={det}
          allDetections={history}
          onDismiss={onDismiss}
          onAddFilter={onAddFilter}
        />
      ))}
    </div>
  )
}
