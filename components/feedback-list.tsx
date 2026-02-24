"use client"

import { Button } from "@/components/ui/button"
import { CirclePlus } from "lucide-react"
import type { FeedbackDetection } from "@/hooks/use-audio-engine"

interface FeedbackListProps {
  detections: FeedbackDetection[]
  onAddFilter: (frequency: number) => void
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

export function FeedbackList({ detections, onAddFilter, isActive }: FeedbackListProps) {
  if (!isActive) {
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

  if (detections.length === 0) {
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          {detections.length} {"frequency" + (detections.length !== 1 ? " peaks" : " peak")} detected
        </span>
      </div>
      {detections.map((detection, index) => (
        <div
          key={`${detection.binIndex}-${index}`}
          className={`flex items-center justify-between rounded-lg border p-3 ${getSeverityBg(
            detection.magnitude
          )} transition-all`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm font-bold ${getSeverityColor(detection.magnitude)}`}>
                {formatFreq(detection.frequency)}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {getMusicalNote(detection.frequency)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-[10px] text-muted-foreground">
                {detection.magnitude.toFixed(1)} dB
              </span>
              <span
                className={`font-mono text-[10px] font-bold uppercase ${getSeverityColor(
                  detection.magnitude
                )}`}
              >
                {getSeverityLabel(detection.magnitude)}
              </span>
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
      ))}
    </div>
  )
}
