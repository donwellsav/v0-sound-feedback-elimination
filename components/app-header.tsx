"use client"

import { Button } from "@/components/ui/button"
import { LevelMeter } from "@/components/level-meter"
import { SettingsPanel, type AppSettings } from "@/components/settings-panel"
import { Activity, Power, Pause, Play, Download, Trash2 } from "lucide-react"
import type { HistoricalDetection } from "@/hooks/use-audio-engine"
import { exportSessionLog } from "@/components/session-log"

interface AppHeaderProps {
  isActive: boolean
  isFrozen: boolean
  sampleRate: number
  rmsLevel: number
  inputGainDb: number
  onInputGainChange: (db: number) => void
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  settings: AppSettings
  detectionHistory: HistoricalDetection[]
  onUpdateSettings: (updates: Partial<AppSettings>) => void
  onResetSettings: () => void
  onStart: () => void
  onStop: () => void
  onToggleFreeze: () => void
  onClearHistory: () => void
}

export function AppHeader({
  isActive,
  isFrozen,
  sampleRate,
  rmsLevel,
  inputGainDb,
  onInputGainChange,
  noiseFloorDb,
  effectiveThresholdDb,
  settings,
  detectionHistory,
  onUpdateSettings,
  onResetSettings,
  onStart,
  onStop,
  onToggleFreeze,
  onClearHistory,
}: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 lg:px-6 h-14 border-b border-border bg-[#121212]">
      {/* Left: Branding */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold text-foreground tracking-tight leading-tight font-sans">
            KillTheRing
            <span className="text-[9px] font-mono text-muted-foreground/40 ml-1.5 align-super font-normal">v0.1</span>
          </h1>
          <span className="text-[10px] font-mono tracking-widest leading-none text-primary uppercase">
            Don Wells AV
          </span>
        </div>

        {/* Status indicators - desktop only */}
        {isActive && (
          <div className="hidden lg:flex items-center gap-3 ml-4 pl-4 border-l border-border">
            <LevelMeter level={rmsLevel} gainDb={inputGainDb} onGainChange={onInputGainChange} />
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {(sampleRate / 1000).toFixed(1)}kHz
              </span>
            </div>
            {isFrozen ? (
              <span className="font-mono text-[10px] text-feedback-warning font-bold bg-feedback-warning/10 px-2 py-0.5 rounded">
                PAUSED
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="font-mono text-[10px] text-primary font-bold">LIVE</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Engine Toggle */}
      <div className="flex items-center gap-2">
        {isActive && (
          <>
            <Button
              onClick={onClearHistory}
              variant="outline"
              size="sm"
              className="gap-1.5 font-mono text-[11px] h-9 px-3 border-border text-muted-foreground hover:text-destructive hover:border-destructive/50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
            <Button
              onClick={onToggleFreeze}
              variant="outline"
              size="sm"
              className={`gap-1.5 font-mono text-[11px] h-9 px-3 ${
                isFrozen
                  ? "border-feedback-warning/50 text-feedback-warning hover:bg-feedback-warning/10 hover:text-feedback-warning"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {isFrozen ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isFrozen ? "Resume" : "Pause"}</span>
            </Button>
          </>
        )}

        <Button
          onClick={isActive ? onStop : onStart}
          size="sm"
          className={`gap-2 font-mono text-xs font-bold h-10 px-6 rounded-lg transition-all ${
            isActive
              ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-[0_0_20px_rgba(255,61,61,0.3)]"
              : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(0,230,118,0.3)]"
          }`}
        >
          <Power className="h-4 w-4" />
          {isActive ? "Stop Engine" : "Start Engine"}
        </Button>
      </div>

      {/* Right: Export + Settings */}
      <div className="flex items-center gap-2">
        <Button
          onClick={() => exportSessionLog(detectionHistory)}
          variant="outline"
          size="sm"
          className="gap-1.5 font-mono text-[11px] h-9 px-3 border-border text-muted-foreground hover:text-primary hover:border-primary/50"
          disabled={detectionHistory.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <SettingsPanel
          settings={settings}
          noiseFloorDb={noiseFloorDb}
          effectiveThresholdDb={effectiveThresholdDb}
          onUpdateSettings={onUpdateSettings}
          onResetDefaults={onResetSettings}
        />
      </div>
    </header>
  )
}
