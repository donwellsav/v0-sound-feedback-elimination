"use client"

import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import type { HistoricalDetection } from "@/hooks/use-audio-engine"
import {
  formatFreq,
  freqToNote,
  getFreqBandLabel,
  getFreqBandColor,
  getSeverityLabel,
  getSeverityColor,
  getRecGain,
  getRecQ,
} from "@/lib/audio-utils"

function findFundamental(freq: number, allDetections: HistoricalDetection[]): number | null {
  for (const other of allDetections) {
    if (Math.abs(other.frequency - freq) < 5) continue
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

function getSeverityBorder(magnitude: number, isActive: boolean): string {
  if (!isActive) return "border-border/50"
  if (magnitude > -15) return "border-feedback-critical/30"
  if (magnitude > -25) return "border-feedback-danger/30"
  return "border-feedback-warning/20"
}

interface TelemetryRowProps {
  detection: HistoricalDetection
  allDetections: HistoricalDetection[]
  onDismiss: (id: string) => void
}

function TelemetryRow({ detection, allDetections, onDismiss }: TelemetryRowProps) {
  const isActive = detection.isActive
  const gain = getRecGain(detection.peakMagnitude)
  const q = getRecQ(detection.peakMagnitude)
  const bandLabel = getFreqBandLabel(detection.frequency)
  const bandColor = getFreqBandColor(detection.frequency)
  const fundamental = findFundamental(detection.frequency, allDetections)

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${getSeverityBorder(
        detection.peakMagnitude,
        isActive
      )} ${isActive ? "bg-secondary/50" : "bg-secondary/20 opacity-80"}`}
    >
      {/* Left: indicator light + severity */}
      <div className="flex flex-col items-center gap-1 shrink-0 w-10">
        <div
          className={`rounded-full flex items-center justify-center border ${
            isActive
              ? "bg-feedback-danger border-feedback-danger animate-pulse"
              : "bg-muted-foreground/60 border-muted-foreground/60"
          } ${detection.hitCount > 1 ? "min-w-7 h-7 px-1" : "w-5 h-5"}`}
        >
          {detection.hitCount > 1 ? (
            <span className="font-mono text-[10px] font-extrabold text-white tabular-nums leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
              {detection.hitCount > 99 ? "99+" : detection.hitCount}
            </span>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
          )}
        </div>
        <span
          className={`font-mono text-[9px] font-bold uppercase leading-none ${
            getSeverityColor(detection.peakMagnitude)
          }`}
        >
          {getSeverityLabel(isActive ? detection.magnitude : detection.peakMagnitude)}
        </span>
      </div>

      {/* Center: frequency + band + metadata stacked */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono text-lg font-bold tabular-nums leading-tight ${
              isActive ? getSeverityColor(detection.peakMagnitude) : "text-foreground/70"
            }`}
          >
            {formatFreq(detection.frequency)}
          </span>
          <span className={`font-mono text-[11px] font-medium uppercase ${bandColor}`}>
            {bandLabel}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {freqToNote(detection.frequency)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-foreground/80 tabular-nums">
            Cut {gain} dB
          </span>
          <span className="font-mono text-[11px] text-foreground/80 tabular-nums">
            Q {q}
          </span>
          {fundamental && (
            <span className="font-mono text-[11px] font-medium text-purple-400 bg-purple-400/15 px-1.5 rounded">
              Harmonic of {fundamental >= 1000 ? `${(fundamental / 1000).toFixed(1)}k` : `${Math.round(fundamental)} Hz`}
            </span>
          )}
        </div>
      </div>

      {/* Right: dismiss */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDismiss(detection.id)}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

interface TelemetryPanelProps {
  history: HistoricalDetection[]
  onDismiss: (id: string) => void
  isActive: boolean
}

export function TelemetryPanel({
  history,
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
        />
      ))}
    </div>
  )
}
