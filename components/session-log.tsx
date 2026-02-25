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

function freqToNote(freq: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const semitones = 12 * Math.log2(freq / 440)
  const noteIndex = Math.round(semitones) + 69
  const octave = Math.floor(noteIndex / 12) - 1
  return `${noteNames[((noteIndex % 12) + 12) % 12]}${octave}`
}

function pad(str: string, len: number): string {
  return str.padEnd(len)
}

export function exportSessionCsv(history: HistoricalDetection[]) {
  if (history.length === 0) return

  const sorted = [...history].sort((a, b) => a.frequency - b.frequency)
  const now = new Date()
  const lines: string[] = []

  lines.push("Frequency (Hz),Note,Band,Peak dB,Hit Count,First Seen,Last Seen,Rec Gain (dB),Rec Q,Severity")

  for (const det of sorted) {
    const note = freqToNote(det.frequency)
    const band = getFreqBandLabel(det.frequency)
    const gain = det.peakMagnitude > -15 ? -18 : det.peakMagnitude > -25 ? -12 : -8
    const q = det.peakMagnitude > -15 ? 40 : det.peakMagnitude > -25 ? 30 : 20
    const severity = det.peakMagnitude > -15 ? "CRITICAL" : det.peakMagnitude > -25 ? "HIGH" : "MODERATE"
    lines.push(
      `${det.frequency.toFixed(1)},${note},${band},${det.peakMagnitude.toFixed(1)},${det.hitCount},${formatTime(det.firstSeen)},${formatTime(det.lastSeen)},${gain},${q},${severity}`
    )
  }

  const content = lines.join("\n")
  const blob = new Blob([content], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `KillTheRing_Session_${now.toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportSessionLog(history: HistoricalDetection[]) {
  if (history.length === 0) return

  const sorted = [...history].sort((a, b) => a.frequency - b.frequency)
  const now = new Date()
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  const timeStr = now.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })

  const divider = "=".repeat(72)
  const thinDiv = "-".repeat(72)
  const lines: string[] = []

  lines.push(divider)
  lines.push("  KillTheRing -- Session Report")
  lines.push(divider)
  lines.push("")
  lines.push(`  Date     : ${dateStr}`)
  lines.push(`  Time     : ${timeStr}`)
  lines.push(`  Events   : ${sorted.length}`)
  lines.push("")
  lines.push(thinDiv)
  lines.push(
    `  ${pad("Freq", 12)}${pad("Note", 6)}${pad("Band", 8)}${pad("Peak dB", 10)}${pad("Hits", 6)}${pad("First Seen", 14)}${pad("Last Seen", 14)}`
  )
  lines.push(thinDiv)

  for (const det of sorted) {
    const hz =
      det.frequency >= 1000
        ? `${(det.frequency / 1000).toFixed(2)} kHz`
        : `${Math.round(det.frequency)} Hz`
    const note = freqToNote(det.frequency)
    const band = getFreqBandLabel(det.frequency)
    const peak = `${det.peakMagnitude.toFixed(1)} dB`
    const hits = `${det.hitCount}x`
    const first = formatTime(det.firstSeen)
    const last = formatTime(det.lastSeen)

    lines.push(
      `  ${pad(hz, 12)}${pad(note, 6)}${pad(band, 8)}${pad(peak, 10)}${pad(hits, 6)}${pad(first, 14)}${pad(last, 14)}`
    )
  }

  lines.push(thinDiv)
  lines.push("")
  lines.push("  EQ Recommendations:")
  lines.push("")

  for (const det of sorted) {
    const hz =
      det.frequency >= 1000
        ? `${(det.frequency / 1000).toFixed(2)} kHz`
        : `${Math.round(det.frequency)} Hz`
    const gain = det.peakMagnitude > -15 ? -18 : det.peakMagnitude > -25 ? -12 : -8
    const q = det.peakMagnitude > -15 ? 40 : det.peakMagnitude > -25 ? 30 : 20
    const severity =
      det.peakMagnitude > -15 ? "CRITICAL" : det.peakMagnitude > -25 ? "HIGH" : "MODERATE"

    lines.push(`  [${severity}]  ${pad(hz, 12)}  Cut ${gain} dB   Q = ${q}`)
  }

  lines.push("")
  lines.push(divider)
  lines.push("  Generated by KillTheRing  |  killthering.com")
  lines.push(divider)
  lines.push("")

  const content = lines.join("\n")
  const blob = new Blob([content], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `KillTheRing_Session_${now.toISOString().slice(0, 10)}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
            onClick={() => exportSessionLog(history)}
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
