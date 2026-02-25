"use client"

import { useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import type { HistoricalDetection } from "@/hooks/use-audio-engine"

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

function getSeverityLabel(magnitude: number): string {
  if (magnitude > -15) return "CRITICAL"
  if (magnitude > -25) return "HIGH"
  if (magnitude > -35) return "MED"
  return "LOW"
}

function getRecGain(magnitude: number): number {
  return magnitude > -15 ? -18 : -10
}

function getRecQ(magnitude: number): number {
  return magnitude > -15 ? 40 : 25
}

// ---------- HitCard ----------

interface HitCardProps {
  detection: HistoricalDetection
  allDetections: HistoricalDetection[]
  onDismiss: (id: string) => void
}

function HitCard({ detection, allDetections, onDismiss }: HitCardProps) {
  const isActive = detection.isActive
  const cardRef = useRef<HTMLDivElement>(null)
  const gain = getRecGain(detection.peakMagnitude)
  const q = getRecQ(detection.peakMagnitude)
  const bandLabel = getFreqBandLabel(detection.frequency)
  const bandColor = getFreqBandColor(detection.frequency)
  const fundamental = findFundamental(detection.frequency, allDetections)

  // Slide-in animation on mount
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    el.style.opacity = "0"
    el.style.transform = "translateY(-12px)"
    requestAnimationFrame(() => {
      el.style.transition = "opacity 300ms ease-out, transform 300ms ease-out"
      el.style.opacity = "1"
      el.style.transform = "translateY(0)"
    })
  }, [])

  return (
    <Card
      ref={cardRef}
      className={`bg-[#18181B] p-4 ${
        isActive
          ? "border-destructive shadow-[0_0_12px_rgba(255,50,50,0.15)]"
          : "border-muted-foreground/30 opacity-70"
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Left: indicator light + hit count */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className={`rounded-full flex items-center justify-center border-2 ${
              isActive
                ? "bg-destructive border-destructive animate-pulse"
                : "bg-muted-foreground/50 border-muted-foreground/50"
            } ${detection.hitCount > 1 ? "min-w-8 h-8 px-1.5" : "w-6 h-6"}`}
          >
            {detection.hitCount > 1 ? (
              <span className="font-mono text-[11px] font-extrabold text-white tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                {detection.hitCount > 99 ? "99+" : detection.hitCount}
              </span>
            ) : (
              <div className="w-2 h-2 rounded-full bg-white/50" />
            )}
          </div>
          <span
            className={`font-mono text-[9px] font-bold uppercase leading-none ${
              isActive ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {getSeverityLabel(isActive ? detection.magnitude : detection.peakMagnitude)}
          </span>
        </div>

        {/* Center: frequency hero + metadata */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {/* Frequency -- the hero */}
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-4xl font-bold tabular-nums leading-none ${
                isActive ? "text-destructive" : "text-foreground/60"
              }`}
            >
              {formatFreq(detection.frequency)}
            </span>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-xs font-medium uppercase ${bandColor}`}>
              {bandLabel}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {getMusicalNote(detection.frequency)}
            </span>
            <span className="text-muted-foreground/30">|</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              Level: {(isActive ? detection.magnitude : detection.peakMagnitude).toFixed(1)} dB
            </span>
          </div>

          {/* Advisory row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-foreground/70 tabular-nums">
              Cut {gain} dB
            </span>
            <span className="font-mono text-[11px] text-foreground/70 tabular-nums">
              Q {q}
            </span>
            {fundamental && (
              <span className="font-mono text-[11px] font-medium text-purple-400 bg-purple-400/15 px-1.5 rounded">
                Harmonic of {fundamental >= 1000 ? `${(fundamental / 1000).toFixed(1)}k` : `${Math.round(fundamental)} Hz`}
              </span>
            )}
          </div>
        </div>

        {/* Right: dismiss button */}
        <Button
          onClick={() => onDismiss(detection.id)}
          variant="outline"
          size="sm"
          className="shrink-0 h-10 px-4 font-mono text-xs border-muted-foreground/30 text-muted-foreground hover:text-destructive hover:border-destructive/50"
        >
          <X className="h-4 w-4 mr-1" />
          Dismiss
        </Button>
      </div>
    </Card>
  )
}

// ---------- TargetHitList ----------

interface TargetHitListProps {
  activeHits: HistoricalDetection[]
  onDismiss: (id: string) => void
  isEngineActive: boolean
}

export function TargetHitList({ activeHits, onDismiss, isEngineActive }: TargetHitListProps) {
  // Empty state: engine off
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

  // Empty state: engine on, no hits
  if (activeHits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-10 h-10 rounded-full border border-primary/20 flex items-center justify-center mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="text-primary text-sm font-medium font-sans">
          System Stable
        </div>
        <div className="text-muted-foreground/40 text-xs font-sans mt-1">
          Listening for anomalies...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activeHits.map((hit) => (
        <HitCard
          key={hit.id}
          detection={hit}
          allDetections={activeHits}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}
