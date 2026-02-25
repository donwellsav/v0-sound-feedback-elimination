"use client"

import type { HistoricalDetection } from "@/hooks/use-audio-engine"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

// ---------- Helpers ----------

function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(2)} kHz`
  return `${Math.round(freq)} Hz`
}

function getMusicalNote(freq: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const semitones = 12 * Math.log2(freq / 440)
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

function findFundamental(freq: number, allDetections: HistoricalDetection[]): number | null {
  for (const other of allDetections) {
    if (Math.abs(other.frequency - freq) < 5) continue
    for (const multiplier of [2, 3, 4]) {
      const expected = other.frequency * multiplier
      const ratio = freq / expected
      if (ratio > 0.97 && ratio < 1.03) return other.frequency
    }
  }
  return null
}

function getSeverityColor(magnitude: number): string {
  if (magnitude > -15) return "text-destructive"
  if (magnitude > -25) return "text-feedback-danger"
  if (magnitude > -35) return "text-feedback-warning"
  return "text-muted-foreground"
}

function getSeverityLabel(magnitude: number): string {
  if (magnitude > -15) return "CRIT"
  if (magnitude > -25) return "HIGH"
  if (magnitude > -35) return "MED"
  return "LOW"
}

function getSeverityBorder(magnitude: number, isActive: boolean): string {
  if (!isActive) return "border-muted-foreground/20"
  if (magnitude > -15) return "border-destructive/60"
  if (magnitude > -25) return "border-feedback-danger/40"
  if (magnitude > -35) return "border-feedback-warning/30"
  return "border-muted-foreground/20"
}

function getRecGain(magnitude: number): number {
  return magnitude > -15 ? -18 : -10
}

function getRecQ(magnitude: number): number {
  return magnitude > -15 ? 40 : 25
}

// ---------- TelemetryRow ----------

interface RowProps {
  detection: HistoricalDetection
  allDetections: HistoricalDetection[]
  onDismiss: (id: string) => void
}

function TelemetryRow({ detection, allDetections, onDismiss }: RowProps) {
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
        {/* Frequency row */}
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
            {getMusicalNote(detection.frequency)}
          </span>
        </div>

        {/* Metadata row */}
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
        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDismiss(detection.id)}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ---------- TargetHitList ----------

interface TargetHitListProps {
  activeHits: HistoricalDetection[]
  onDismiss: (id: string) => void
  isEngineActive: boolean
}

export function TargetHitList({ activeHits, onDismiss, isEngineActive }: TargetHitListProps) {
  if (!isEngineActive && activeHits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-muted-foreground text-sm font-sans">Waiting for audio input</div>
        <div className="text-muted-foreground/50 text-xs font-sans mt-1">
          Start the engine to detect feedback
        </div>
      </div>
    )
  }

  if (activeHits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-10 h-10 rounded-full border border-primary/20 flex items-center justify-center mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="text-primary text-sm font-medium font-sans">System Stable</div>
        <div className="text-muted-foreground/40 text-xs font-sans mt-1">
          Listening for anomalies...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activeHits.map((hit) => (
        <TelemetryRow
          key={hit.id}
          detection={hit}
          allDetections={activeHits}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}
