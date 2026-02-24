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
  if (freq < 250) return "text-blue-400/60"
  if (freq < 1000) return "text-amber-400/60"
  if (freq < 4000) return "text-orange-400/60"
  if (freq < 8000) return "text-red-400/60"
  return "text-purple-400/60"
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
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${getSeverityBorder(
        detection.peakMagnitude,
        isActive
      )} ${isActive ? "bg-secondary/50" : "bg-secondary/20 opacity-70"}`}
    >
      {/* Status dot */}
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${
          isActive ? "bg-feedback-danger animate-pulse" : "bg-feedback-warning/50"
        }`}
      />

      {/* Severity tag */}
      <span
        className={`font-mono text-[9px] font-bold uppercase w-8 shrink-0 ${
          isActive ? getSeverityColor(detection.peakMagnitude) : "text-muted-foreground/60"
        }`}
      >
        {isActive ? getSeverityLabel(detection.magnitude) : "STALE"}
      </span>

      {/* Frequency */}
      <span
        className={`font-mono text-sm font-bold tabular-nums shrink-0 ${
          isActive ? getSeverityColor(detection.peakMagnitude) : "text-muted-foreground"
        }`}
      >
        {formatFreq(detection.frequency)}
      </span>

      {/* Musical note */}
      <span className="font-mono text-[9px] text-muted-foreground/50 shrink-0">
        {getMusicalNote(detection.frequency)}
      </span>

      {/* Band label */}
      <span className={`font-mono text-[8px] uppercase tracking-wider shrink-0 ${bandColor}`}>
        {bandLabel}
      </span>

      {/* Harmonic indicator */}
      {fundamental && (
        <span className="font-mono text-[8px] text-purple-400/70 bg-purple-400/10 px-1 rounded shrink-0">
          H of {fundamental >= 1000 ? `${(fundamental / 1000).toFixed(1)}k` : `${Math.round(fundamental)}`}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Rec values */}
      <span className="font-mono text-[9px] text-muted-foreground tabular-nums shrink-0">
        {gain}dB
      </span>
      <span className="text-muted-foreground/20 shrink-0">|</span>
      <span className="font-mono text-[9px] text-muted-foreground tabular-nums shrink-0">
        Q{q}
      </span>

      {/* Peak */}
      <span className="font-mono text-[9px] text-muted-foreground/50 tabular-nums shrink-0 w-10 text-right">
        {detection.peakMagnitude.toFixed(0)}dB
      </span>

      {/* Hit count */}
      {detection.hitCount > 1 && (
        <span className="font-mono text-[8px] text-muted-foreground/40 bg-secondary px-1 rounded shrink-0">
          {detection.hitCount}x
        </span>
      )}

      {/* Add to recommended cuts */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-primary shrink-0"
        onClick={() => onAddFilter(detection.frequency)}
        aria-label={`Add recommendation for ${formatFreq(detection.frequency)}`}
      >
        <CirclePlus className="h-3.5 w-3.5" />
      </Button>

      {/* Dismiss */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDismiss(detection.id)}
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </Button>
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

  const liveCount = history.filter((h) => h.isActive).length

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-widest">
          Targets
        </span>
        {liveCount > 0 && (
          <span className="font-mono text-[9px] font-bold text-feedback-danger bg-feedback-danger/10 px-1.5 py-0.5 rounded">
            {liveCount} LIVE
          </span>
        )}
      </div>
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
