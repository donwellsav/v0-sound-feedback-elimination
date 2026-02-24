"use client"

import { memo } from "react"
import { Button } from "@/components/ui/button"
import { LevelMeter } from "@/components/level-meter"
import { SettingsPanel, type AppSettings } from "@/components/settings-panel"
import { Activity, Power, Pause, Play } from "lucide-react"

interface AppHeaderProps {
  isActive: boolean
  isFrozen: boolean
  sampleRate: number
  rmsLevel: number
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  settings: AppSettings
  onUpdateSettings: (updates: Partial<AppSettings>) => void
  onResetSettings: () => void
  onStart: () => void
  onStop: () => void
  onToggleFreeze: () => void
}

export function AppHeader({
  isActive,
  isFrozen,
  sampleRate,
  rmsLevel,
  noiseFloorDb,
  effectiveThresholdDb,
  settings,
  onUpdateSettings,
  onResetSettings,
  onStart,
  onStop,
  onToggleFreeze,
}: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 lg:px-6 h-14 border-b border-border bg-[#121212]">
      {/* Left: Branding */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold text-foreground tracking-tight leading-tight font-sans">
            KillTheRing
          </h1>
          <span className="text-[10px] font-mono tracking-widest leading-none text-primary uppercase">
            Don Wells AV
          </span>
        </div>

        {/* Status indicators - desktop only */}
        {isActive && (
          <div className="hidden lg:flex items-center gap-3 ml-4 pl-4 border-l border-border">
            <LevelMeter level={rmsLevel} />
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
        )}
const HeaderLogo = memo(function HeaderLogo() {
  return (
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
  )
})

// HeaderStatus isolates the high-frequency updates (rmsLevel) from the rest of the header
// to prevent re-rendering of static controls and settings.
const HeaderStatus = memo(function HeaderStatus({
  isActive,
  isFrozen,
  sampleRate,
  rmsLevel,
}: {
  isActive: boolean
  isFrozen: boolean
  sampleRate: number
  rmsLevel: number
}) {
  if (!isActive) return null

  return (
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
  )
})

const HeaderControls = memo(function HeaderControls({
  isActive,
  isFrozen,
  settings,
  onUpdateSettings,
  onResetSettings,
  onStart,
  onStop,
  onToggleFreeze,
}: {
  isActive: boolean
  isFrozen: boolean
  settings: AppSettings
  onUpdateSettings: (updates: Partial<AppSettings>) => void
  onResetSettings: () => void
  onStart: () => void
  onStop: () => void
  onToggleFreeze: () => void
}) {
  return (
    <>
      {isActive && (
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

      {/* Right: Settings */}
      <div className="flex items-center gap-2">
        <SettingsPanel
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
    </>
  )
})

export function AppHeader({
  isActive,
  isFrozen,
  sampleRate,
  rmsLevel,
  settings,
  onUpdateSettings,
  onResetSettings,
  onStart,
  onStop,
  onToggleFreeze,
}: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-border bg-card">
      <HeaderLogo />

      <div className="flex items-center gap-3">
        <HeaderStatus
          isActive={isActive}
          isFrozen={isFrozen}
          sampleRate={sampleRate}
          rmsLevel={rmsLevel}
        />

        <HeaderControls
          isActive={isActive}
          isFrozen={isFrozen}
          settings={settings}
          noiseFloorDb={noiseFloorDb}
          effectiveThresholdDb={effectiveThresholdDb}
          onUpdateSettings={onUpdateSettings}
          onResetSettings={onResetSettings}
          onStart={onStart}
          onStop={onStop}
          onToggleFreeze={onToggleFreeze}
        />
      </div>
    </header>
  )
}
