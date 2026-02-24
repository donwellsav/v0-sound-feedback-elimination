"use client"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, Clock, Download } from "lucide-react"
import type { HistoricalDetection } from "@/hooks/use-audio-engine"

interface SessionLogProps {
  history: HistoricalDetection[]
  onClearHistory: () => void
}

function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(1)}kHz`
  return `${Math.round(freq)}Hz`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

function getFreqBandLabel(freq: number): string {
  if (freq < 100) return "Sub"
  if (freq < 250) return "Bass"
  if (freq < 500) return "Mud"
  if (freq < 1000) return "Body"
  if (freq < 2000) return "Honk"
  if (freq < 4000) return "Pres"
  if (freq < 6000) return "Bite"
  if (freq < 8000) return "Sibil"
  if (freq < 12000) return "Brill"
  return "Air"
}

function getSeverityDot(magnitude: number, isActive: boolean): string {
  if (!isActive) return "bg-muted-foreground/40"
  if (magnitude > -15) return "bg-feedback-critical"
  if (magnitude > -25) return "bg-feedback-danger"
  if (magnitude > -35) return "bg-feedback-warning"
  return "bg-primary"
}

function exportSessionReport(history: HistoricalDetection[]) {
  const sorted = [...history].sort((a, b) => a.frequency - b.frequency)
  const now = new Date()
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  const timeStr = now.toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "2-digit" })

  let csv = "KillTheRing - Session Report\n"
  csv += `Date: ${dateStr} ${timeStr}\n`
  csv += `Total Detections: ${sorted.length}\n`
  csv += "\n"
  csv += "Frequency (Hz),Band,Note,Peak dB,Hit Count,First Seen,Last Seen,Rec Gain (dB),Rec Q\n"

  for (const det of sorted) {
    const band = getFreqBandLabel(det.frequency)
    // Musical note inline
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    const semitones = 12 * Math.log2(det.frequency / 440)
    const noteIndex = Math.round(semitones) + 69
    const octave = Math.floor(noteIndex / 12) - 1
    const note = `${noteNames[((noteIndex % 12) + 12) % 12]}${octave}`
    const gain = det.peakMagnitude > -15 ? -18 : -10
    const q = det.peakMagnitude > -15 ? 40 : 25
    csv += `${det.frequency.toFixed(1)},${band},${note},${det.peakMagnitude.toFixed(1)},${det.hitCount},${formatTime(det.firstSeen)},${formatTime(det.lastSeen)},${gain},${q}\n`
  }

  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `killthering-session-${now.toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function SessionLog({ history, onClearHistory }: SessionLogProps) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-5 w-5 text-muted-foreground/20 mb-2" />
        <div className="text-muted-foreground/50 text-xs font-sans">No events logged</div>
      </div>
    )
  }

  // Sort by frequency low-to-high
  const sorted = [...history].sort((a, b) => a.frequency - b.frequency)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Session Log
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary"
            onClick={() => exportSessionReport(history)}
          >
            <Download className="h-3 w-3" />
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-[10px] font-mono text-muted-foreground hover:text-destructive"
            onClick={onClearHistory}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 pr-2">
          {sorted.map((det) => (
            <div
              key={det.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50 transition-colors"
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getSeverityDot(det.peakMagnitude, det.isActive)}`} />
              <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                {formatTime(det.lastSeen)}
              </span>
              <span className="font-mono text-[11px] text-foreground font-medium tabular-nums">
                {formatFreq(det.frequency)}
              </span>
              <span className="font-mono text-[8px] text-muted-foreground/50 uppercase w-8 shrink-0">
                {getFreqBandLabel(det.frequency)}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {det.peakMagnitude.toFixed(1)}dB
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/40 tabular-nums">
                {det.hitCount}x
              </span>
              {det.isActive && (
                <span className="font-mono text-[9px] text-feedback-danger font-bold ml-auto">LIVE</span>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
