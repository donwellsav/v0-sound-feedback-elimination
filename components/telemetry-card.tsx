"use client"

import { Button } from "@/components/ui/button"
import { X, CirclePlus, Crosshair } from "lucide-react"
import type { FeedbackDetection, HistoricalDetection } from "@/hooks/use-audio-engine"

interface TelemetryCardProps {
  detection: HistoricalDetection
  onDismiss: (id: string) => void
  onAddFilter: (frequency: number) => void
  rank: number
}

function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(1)} kHz`
  return `${Math.round(freq)} Hz`
}

function formatFreqHero(freq: number): string {
  return freq.toFixed(1)
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

function getSeverityLabel(magnitude: number): string {
  if (magnitude > -15) return "CRITICAL"
  if (magnitude > -25) return "HIGH"
  if (magnitude > -35) return "MEDIUM"
  return "LOW"
}

function getSeverityColor(magnitude: number): string {
  if (magnitude > -15) return "text-feedback-critical"
  if (magnitude > -25) return "text-feedback-danger"
  if (magnitude > -35) return "text-feedback-warning"
  return "text-primary"
}

function getSeverityBorder(magnitude: number, isActive: boolean): string {
  if (!isActive) return "border-feedback-warning/20"
  if (magnitude > -15) return "border-feedback-critical/40"
  if (magnitude > -25) return "border-feedback-danger/40"
  return "border-feedback-warning/30"
}

function getSeverityGlow(magnitude: number, isActive: boolean): string {
  if (!isActive) return ""
  if (magnitude > -15) return "shadow-[0_0_24px_rgba(255,23,68,0.15)]"
  if (magnitude > -25) return "shadow-[0_0_16px_rgba(255,61,61,0.1)]"
  return ""
}

function getQ(magnitude: number): number {
  if (magnitude > -15) return 40
  return 25
}

function getGain(magnitude: number): number {
  if (magnitude > -15) return -18
  return -10
}

export function TelemetryCard({ detection, onDismiss, onAddFilter, rank }: TelemetryCardProps) {
  const isActive = detection.isActive
  const severity = getSeverityLabel(detection.peakMagnitude)
  const q = getQ(detection.peakMagnitude)
  const gain = getGain(detection.peakMagnitude)

  return (
    <div
      className={`relative rounded-xl border-2 bg-[#0e0e0e] p-4 transition-all ${getSeverityBorder(
        detection.peakMagnitude,
        isActive
      )} ${getSeverityGlow(detection.peakMagnitude, isActive)}`}
    >
      {/* Top row: severity + dismiss */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isActive ? "bg-feedback-danger animate-pulse" : "bg-feedback-warning/60"
            }`}
          />
          <span
            className={`font-mono text-[11px] font-bold uppercase tracking-wider ${
              isActive ? getSeverityColor(detection.peakMagnitude) : "text-muted-foreground"
            }`}
          >
            {isActive ? severity : "STALE"}
          </span>
          {detection.hitCount > 1 && (
            <span className="font-mono text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {detection.hitCount}x
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDismiss(detection.id)}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Hero frequency */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono text-3xl lg:text-4xl font-bold tabular-nums leading-none ${
              isActive ? getSeverityColor(detection.peakMagnitude) : "text-muted-foreground"
            }`}
          >
            {formatFreqHero(detection.frequency)}
          </span>
          <span className="font-mono text-sm text-muted-foreground">Hz</span>
          <span className="font-mono text-xs text-muted-foreground/60 ml-1">
            {getMusicalNote(detection.frequency)}
          </span>
        </div>
      </div>

      {/* Recommended cut values */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-wider">
            Rec. Cut
          </span>
          <span className="font-mono text-lg font-bold text-foreground tabular-nums">
            {gain.toFixed(1)} dB
          </span>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex flex-col">
          <span className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-wider">
            Bandwidth
          </span>
          <span className="font-mono text-lg font-bold text-foreground tabular-nums">
            Q: {q.toFixed(1)}
          </span>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex flex-col">
          <span className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-wider">
            Peak
          </span>
          <span className="font-mono text-lg font-bold text-foreground tabular-nums">
            {detection.peakMagnitude.toFixed(1)} dB
          </span>
        </div>
      </div>

      {/* Action button */}
      <Button
        onClick={() => onAddFilter(detection.frequency)}
        variant="outline"
        size="sm"
        className="w-full gap-2 font-mono text-xs h-10 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
      >
        <Crosshair className="h-3.5 w-3.5" />
        Apply Notch Filter
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
  detections,
  history,
  onAddFilter,
  onDismiss,
  isActive,
}: TelemetryPanelProps) {
  if (!isActive && history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Crosshair className="h-8 w-8 text-muted-foreground/20 mb-3" />
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
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 flex items-center justify-center mb-3">
          <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="text-primary text-sm font-medium font-sans">No feedback detected</div>
        <div className="text-muted-foreground/50 text-xs font-sans mt-1">System is clean</div>
      </div>
    )
  }

  // Show top 3 most severe detections as cards
  const topDetections = history.slice(0, 3)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Target Hit List
        </span>
        {detections.length > 0 && (
          <span className="font-mono text-[10px] font-bold text-feedback-danger bg-feedback-danger/10 px-2 py-0.5 rounded">
            {detections.length} LIVE
          </span>
        )}
      </div>
      {topDetections.map((det, i) => (
        <TelemetryCard
          key={det.id}
          detection={det}
          onDismiss={onDismiss}
          onAddFilter={onAddFilter}
          rank={i + 1}
        />
      ))}
    </div>
  )
}
