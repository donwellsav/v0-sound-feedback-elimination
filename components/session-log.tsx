"use client"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, Clock } from "lucide-react"
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

function getSeverityDot(magnitude: number, isActive: boolean): string {
  if (!isActive) return "bg-muted-foreground/40"
  if (magnitude > -15) return "bg-feedback-critical"
  if (magnitude > -25) return "bg-feedback-danger"
  if (magnitude > -35) return "bg-feedback-warning"
  return "bg-primary"
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

  // Reverse chronological
  const sorted = [...history].sort((a, b) => b.lastSeen - a.lastSeen)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Session Log
        </span>
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
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {det.peakMagnitude.toFixed(1)}dB
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
