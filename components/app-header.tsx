"use client"

import { Button } from "@/components/ui/button"
import { Activity, Mic, MicOff, Radio } from "lucide-react"

interface AppHeaderProps {
  isActive: boolean
  sampleRate: number
  onStart: () => void
  onStop: () => void
}

export function AppHeader({ isActive, sampleRate, onStart, onStop }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            FeedbackKiller
          </h1>
        </div>
        <span className="hidden sm:inline text-xs text-muted-foreground font-mono border-l border-border pl-3">
          Live Feedback Analyzer
        </span>
      </div>

      <div className="flex items-center gap-3">
        {isActive && (
          <div className="hidden md:flex items-center gap-4 mr-2">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-feedback-safe" />
              <span className="font-mono text-[11px] text-muted-foreground">
                {(sampleRate / 1000).toFixed(1)} kHz
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-feedback-safe animate-pulse" />
              <span className="font-mono text-[11px] text-feedback-safe">LIVE</span>
            </div>
          </div>
        )}

        <Button
          onClick={isActive ? onStop : onStart}
          variant={isActive ? "destructive" : "default"}
          size="sm"
          className="gap-2 font-mono text-xs"
        >
          {isActive ? (
            <>
              <MicOff className="h-3.5 w-3.5" />
              Stop
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              Start Analysis
            </>
          )}
        </Button>
      </div>
    </header>
  )
}
