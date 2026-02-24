"use client"

import { Button } from "@/components/ui/button"
import { CirclePlus, Trash2, Clock } from "lucide-react"
import type { FeedbackDetection, HistoricalDetection } from "@/hooks/use-audio-engine"

interface FeedbackListProps {
  detections: FeedbackDetection[]
  history: HistoricalDetection[]
  onAddFilter: (frequency: number) => void
  onClearHistory: () => void
  isActive: boolean
}

function getSeverityColor(magnitude: number): string {
  if (magnitude > -15) return "text-feedback-critical"
  if (magnitude > -25) return "text-feedback-danger"
  if (magnitude > -35) return "text-feedback-warning"
  return "text-feedback-safe"
}

function getSeverityBg(magnitude: number): string {
  if (magnitude > -15) return "bg-feedback-critical/10 border-feedback-critical/30"
  if (magnitude > -25) return "bg-feedback-danger/10 border-feedback-danger/30"
  if (magnitude > -35) return "bg-feedback-warning/10 border-feedback-warning/30"
  return "bg-feedback-safe/10 border-feedback-safe/30"
}

function getSeverityLabel(magnitude: number): string {
  if (magnitude > -15) return "CRITICAL"
  if (magnitude > -25) return "HIGH"
  if (magnitude > -35) return "MEDIUM"
  return "LOW"
}

function formatFreq(freq: number): string {
  return freq >= 1000 ? `${(freq / 1000).toFixed(2)} kHz` : `${Math.round(freq)} Hz`
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

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s ago`
}

function formatDuration(firstSeen: number, lastSeen: number): string {
  const ms = lastSeen - firstSeen
  if (ms < 1000) return "<1s"
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

export function FeedbackList({ detections, history, onAddFilter, onClearHistory, isActive }: FeedbackListProps) {
  if (!isActive && history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-3">
          <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="text-muted-foreground text-sm">Waiting for audio input</div>
        <div className="text-muted-foreground/60 text-xs mt-1">
          Start the analyzer to detect feedback
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-feedback-safe/30 flex items-center justify-center mb-3">
          <div className="w-3 h-3 rounded-full bg-feedback-safe animate-pulse" />
        </div>
        <div className="text-feedback-safe text-sm font-medium">No feedback detected</div>
        <div className="text-muted-foreground/60 text-xs mt-1">
          System is clean
        </div>
      </div>
    )
  }

  const now = Date.now()
  const activeCount = history.filter((h) => h.isActive).length

  return (
    <div className="space-y-2">
      {/* Header with counts and clear button */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            {history.length} logged
          </span>
          {activeCount > 0 && (
            <span className="text-[10px] font-mono font-bold text-feedback-danger bg-feedback-danger/10 px-1.5 py-0.5 rounded">
              {activeCount} LIVE
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] font-mono text-muted-foreground hover:text-destructive gap-1"
          onClick={onClearHistory}
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>

      {/* Detection entries */}
      {history.map((detection) => {
        const elapsed = now - detection.lastSeen

        return (
          <div
            key={detection.id}
            className={`flex items-center justify-between rounded-lg border p-3 transition-all ${getSeverityBg(
              detection.peakMagnitude
            )}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {/* Active indicator dot */}
                <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-feedback-danger animate-pulse" />
                <span className={`font-mono text-sm font-bold ${getSeverityColor(detection.magnitude)}`}>
                  {formatFreq(detection.frequency)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {getMusicalNote(detection.frequency)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 ml-3.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Peak: {detection.peakMagnitude.toFixed(1)} dB
                </span>
                <span className={`font-mono text-[10px] font-bold uppercase ${getSeverityColor(detection.peakMagnitude)}`}>
                  {getSeverityLabel(detection.magnitude)}
                </span>
              </div>
              {/* Timing info */}
              <div className="flex items-center gap-3 mt-1 ml-3.5">
                <div className="flex items-center gap-1 text-muted-foreground/50">
                  <Clock className="h-2.5 w-2.5" />
                  <span className="font-mono text-[9px]">
                    Active for {formatDuration(detection.firstSeen, now)}
                  </span>
                </div>
                {detection.hitCount > 1 && (
                  <span className="font-mono text-[9px] text-muted-foreground/50">
                    {detection.hitCount}x seen
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
              onClick={() => onAddFilter(detection.frequency)}
              aria-label={`Add notch filter at ${formatFreq(detection.frequency)}`}
              title="Add notch filter"
            >
              <CirclePlus className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
