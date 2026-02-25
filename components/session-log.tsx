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

function exportSessionLog(history: HistoricalDetection[]) {
  if (history.length === 0) {
    alert("No feedback events to export.")
    return
  }

  const sorted = [...history].sort((a, b) => a.firstSeen - b.firstSeen)

  let fileContent = "--- KillTheRing Session Log ---\n"
  fileContent += `Date: ${new Date().toLocaleDateString()}\n`
  fileContent += `Total Events: ${sorted.length}\n\n`

  for (const hit of sorted) {
    const time = new Date(hit.lastSeen).toLocaleTimeString()
    const hz =
      hit.frequency > 1000
        ? `${(hit.frequency / 1000).toFixed(2)} kHz`
        : `${Math.round(hit.frequency)} Hz`
    const band = getFreqBandLabel(hit.frequency)

    fileContent += `[${time}]  ${hz.padEnd(12)} | ${band.padEnd(6)} | Level: ${hit.peakMagnitude.toFixed(1)} dBFS | Hits: ${hit.hitCount}\n`
  }

  const blob = new Blob([fileContent], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `KillTheRing_Session_${new Date().toISOString().slice(0, 10)}.txt`
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 gap-1.5 text-[11px] font-mono font-medium border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => exportSessionLog(history)}
          >
            <Download className="h-3.5 w-3.5" />
            Export Log
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 text-[10px] font-mono text-muted-foreground hover:text-destructive"
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
