"use client"

import { useState, useCallback, useEffect, type MutableRefObject } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Settings, RotateCcw } from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Workflow-only settings (not detector-related)                     */
/* ------------------------------------------------------------------ */
export interface AppSettings {
  historyRetention: number // seconds, 0 = until cleared
  clearOnStart: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  historyRetention: 0,
  clearOnStart: true,
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
interface SettingsDrawerProps {
  detectorRef: MutableRefObject<any>
  settings: AppSettings
  onUpdateSettings: (updates: Partial<AppSettings>) => void
  onResetDefaults: () => void
}

/* ---- tiny layout helpers ---- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border/60 pb-1.5">
        {title}
      </h3>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-foreground/90">{label}</span>
        <span className="font-mono text-[11px] text-primary tabular-nums min-w-[60px] text-right">
          {value}
        </span>
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="flex flex-col">
        <span className="text-[12px] text-foreground/90">{label}</span>
        {description && (
          <span className="text-[10px] text-muted-foreground/60 leading-tight">{description}</span>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  )
}

function formatRetention(value: number): string {
  if (value === 0) return "Until cleared"
  if (value < 60) return `${value}s`
  return `${Math.round(value / 60)}m`
}

export function SettingsDrawer({
  detectorRef,
  settings,
  onUpdateSettings,
  onResetDefaults,
}: SettingsDrawerProps) {
  /* ---- Detector engine state (local, wired directly to setters) ---- */
  const [threshold, setThreshold] = useState(-45)
  const [fftSize, setFftSize] = useState("2048")
  const [sustain, setSustain] = useState(400)
  const [prominence, setProminence] = useState(15)

  // Sync local state from detector ref on mount / open
  const syncFromDetector = useCallback(() => {
    const det = detectorRef.current
    if (!det) return
    setThreshold(det._thresholdDb ?? -45)
    setFftSize(String(det._fftSize ?? 2048))
    setSustain(det._sustainMs ?? 400)
    setProminence(det._prominenceDb ?? 15)
  }, [detectorRef])

  useEffect(() => {
    syncFromDetector()
  }, [syncFromDetector])

  /* ---- Handlers: update local state AND call detector setter ---- */
  const handleThreshold = useCallback(
    ([val]: number[]) => {
      setThreshold(val)
      detectorRef.current?.setThresholdDb(val)
    },
    [detectorRef]
  )

  const handleFftSize = useCallback(
    (val: string) => {
      setFftSize(val)
      detectorRef.current?.setFftSize(parseInt(val))
    },
    [detectorRef]
  )

  const handleSustain = useCallback(
    ([val]: number[]) => {
      setSustain(val)
      detectorRef.current?.setSustainMs(val)
    },
    [detectorRef]
  )

  const handleProminence = useCallback(
    ([val]: number[]) => {
      setProminence(val)
      detectorRef.current?.setProminenceDb(val)
    },
    [detectorRef]
  )

  const handleResetAll = useCallback(() => {
    // Reset detector to defaults
    detectorRef.current?.setThresholdDb(-45)
    detectorRef.current?.setFftSize(2048)
    detectorRef.current?.setSustainMs(400)
    detectorRef.current?.setProminenceDb(15)
    setThreshold(-45)
    setFftSize("2048")
    setSustain(400)
    setProminence(15)
    // Reset workflow settings
    onResetDefaults()
  }, [detectorRef, onResetDefaults])

  return (
    <Sheet onOpenChange={(open) => { if (open) syncFromDetector() }}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 sm:w-96 overflow-y-auto bg-[#0e0e0e] border-border">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-mono text-sm font-bold text-foreground uppercase tracking-wider">
              Settings
            </SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground"
              onClick={handleResetAll}
            >
              <RotateCcw className="h-3 w-3" />
              Reset All
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-8 pb-8">
          {/* Detection Engine -- wired directly to FeedbackDetector */}
          <Section title="Detection Engine">
            <SettingRow label="Threshold (dBFS)" value={`${threshold} dB`}>
              <Slider
                value={[threshold]}
                onValueChange={handleThreshold}
                min={-80}
                max={0}
                step={1}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>-80 dB</span>
                <span>0 dB</span>
              </div>
            </SettingRow>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground/90">FFT Size</span>
                <span className="font-mono text-[11px] text-primary tabular-nums">{fftSize}</span>
              </div>
              <Select value={fftSize} onValueChange={handleFftSize}>
                <SelectTrigger className="h-9 font-mono text-xs bg-secondary/50 border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1024">1024 - Fast, low resolution</SelectItem>
                  <SelectItem value="2048">2048 - Balanced (default)</SelectItem>
                  <SelectItem value="4096">4096 - High resolution</SelectItem>
                  <SelectItem value="8192">8192 - Maximum resolution</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SettingRow label="Sustain Time" value={`${sustain} ms`}>
              <Slider
                value={[sustain]}
                onValueChange={handleSustain}
                min={100}
                max={1000}
                step={50}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>100 ms</span>
                <span>1000 ms</span>
              </div>
            </SettingRow>

            <SettingRow label="Prominence (Crest)" value={`${prominence} dB`}>
              <Slider
                value={[prominence]}
                onValueChange={handleProminence}
                min={5}
                max={30}
                step={1}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>5 dB</span>
                <span>30 dB</span>
              </div>
            </SettingRow>
          </Section>

          {/* History */}
          <Section title="History">
            <SettingRow
              label="Keep detections for"
              value={formatRetention(settings.historyRetention)}
            >
              <Slider
                value={[settings.historyRetention]}
                onValueChange={([v]) => onUpdateSettings({ historyRetention: v })}
                min={0}
                max={120}
                step={5}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>Until cleared</span>
                <span>2 min</span>
              </div>
            </SettingRow>
          </Section>

          {/* Session */}
          <Section title="Session">
            <ToggleRow
              label="Clear detections on start"
              description="Remove all markers when engine starts"
              checked={settings.clearOnStart}
              onChange={(v) => onUpdateSettings({ clearOnStart: v })}
            />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
