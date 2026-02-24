"use client"

import { Button } from "@/components/ui/button"
import { LevelMeter } from "@/components/level-meter"
import { SettingsPanel, type AppSettings } from "@/components/settings-panel"
import { Activity, Mic, MicOff, Radio, Pause, Play } from "lucide-react"

interface AppHeaderProps {
  isActive: boolean
  isFrozen: boolean
  sampleRate: number
  rmsLevel: number
  settings: AppSettings
  onUpdateSettings: (updates: Partial<AppSettings>) => void
  onResetSettings: () => void
  onStart: () => void
  onStop: () => void
  onToggleFreeze: () => void
}

export function AppHeader({ isActive, isFrozen, sampleRate, rmsLevel, settings, onUpdateSettings, onResetSettings, onStart, onStop, onToggleFreeze }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-foreground tracking-tight leading-tight">
              KillTheRing
            </h1>
            <span className="text-[11px] font-mono tracking-wide leading-none text-primary">
              by Don Wells AV
            </span>
          </div>
        </div>
        <span className="hidden sm:inline text-xs text-muted-foreground font-mono border-l border-border pl-3">
          Live Feedback Analyzer
        </span>
      </div>

      <div className="flex items-center gap-3">
        {isActive && (
          <div className="hidden md:flex items-center gap-4 mr-2">
            <LevelMeter level={rmsLevel} />
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-feedback-safe" />
              <span className="font-mono text-[11px] text-muted-foreground">
                {(sampleRate / 1000).toFixed(1)} kHz
              </span>
            </div>
            {isFrozen ? (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-feedback-warning" />
                <span className="font-mono text-[11px] text-feedback-warning font-bold">PAUSED</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-feedback-safe animate-pulse" />
                <span className="font-mono text-[11px] text-feedback-safe">LIVE</span>
              </div>
            )}
          </div>
        )}

        {isActive && (
          <Button
            onClick={onToggleFreeze}
            variant="outline"
            size="sm"
            className={`gap-2 font-mono text-xs ${
              isFrozen
                ? "border-feedback-warning text-feedback-warning hover:bg-feedback-warning/10 hover:text-feedback-warning"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {isFrozen ? (
              <>
                <Play className="h-3.5 w-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </>
            )}
          </Button>
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

        <SettingsPanel
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          onResetDefaults={onResetSettings}
        />
      </div>
    </header>
  )
}
