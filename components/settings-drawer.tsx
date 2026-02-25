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
  SheetDescription,
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
/*  Detector defaults (mirror FeedbackDetector constructor)           */
/* ------------------------------------------------------------------ */
const DET_DEFAULTS = {
  fftSize: 2048,
  thresholdMode: "hybrid",
  thresholdDb: -35,
  relativeThresholdDb: 20,
  prominenceDb: 15,
  neighborhoodBins: 6,
  sustainMs: 400,
  clearMs: 200,
  minFrequencyHz: 80,
  maxFrequencyHz: 12000,
  aWeightingEnabled: false,
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
  description,
  value,
  children,
}: {
  label: string
  description?: string
  value: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[12px] text-foreground/90">{label}</span>
          {description && (
            <span className="text-[10px] text-muted-foreground/60 leading-tight">{description}</span>
          )}
        </div>
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
  const [thresholdMode, setThresholdMode] = useState(DET_DEFAULTS.thresholdMode)
  const [threshold, setThreshold] = useState(DET_DEFAULTS.thresholdDb)
  const [relativeThreshold, setRelativeThreshold] = useState(DET_DEFAULTS.relativeThresholdDb)
  const [fftSize, setFftSize] = useState(String(DET_DEFAULTS.fftSize))
  const [sustain, setSustain] = useState(DET_DEFAULTS.sustainMs)
  const [clearMs, setClearMs] = useState(DET_DEFAULTS.clearMs)
  const [prominence, setProminence] = useState(DET_DEFAULTS.prominenceDb)
  const [neighborhoodBins, setNeighborhoodBins] = useState(DET_DEFAULTS.neighborhoodBins)
  const [minFreq, setMinFreq] = useState(DET_DEFAULTS.minFrequencyHz)
  const [maxFreq, setMaxFreq] = useState(DET_DEFAULTS.maxFrequencyHz)
  const [aWeighting, setAWeighting] = useState(DET_DEFAULTS.aWeightingEnabled)

  // Sync local state from detector ref on mount / open
  const syncFromDetector = useCallback(() => {
    const det = detectorRef.current
    if (!det) return
    setThresholdMode(det._thresholdMode ?? DET_DEFAULTS.thresholdMode)
    setThreshold(det._thresholdDb ?? DET_DEFAULTS.thresholdDb)
    setRelativeThreshold(det._relativeThresholdDb ?? DET_DEFAULTS.relativeThresholdDb)
    setFftSize(String(det._fftSize ?? DET_DEFAULTS.fftSize))
    setSustain(det._sustainMs ?? DET_DEFAULTS.sustainMs)
    setClearMs(det._clearMs ?? DET_DEFAULTS.clearMs)
    setProminence(det._prominenceDb ?? DET_DEFAULTS.prominenceDb)
    setNeighborhoodBins(det._neighborhoodBins ?? DET_DEFAULTS.neighborhoodBins)
    setMinFreq(det._minFrequencyHz ?? DET_DEFAULTS.minFrequencyHz)
    setMaxFreq(det._maxFrequencyHz ?? DET_DEFAULTS.maxFrequencyHz)
    setAWeighting(det._aWeightingEnabled ?? DET_DEFAULTS.aWeightingEnabled)
  }, [detectorRef])

  useEffect(() => {
    syncFromDetector()
  }, [syncFromDetector])

  /* ---- Handlers: update local state AND call detector setter ---- */
  const handleThresholdMode = useCallback(
    (val: string) => {
      setThresholdMode(val)
      detectorRef.current?.setThresholdMode(val)
    },
    [detectorRef]
  )

  const handleThreshold = useCallback(
    ([val]: number[]) => {
      setThreshold(val)
      detectorRef.current?.setThresholdDb(val)
    },
    [detectorRef]
  )

  const handleRelativeThreshold = useCallback(
    ([val]: number[]) => {
      setRelativeThreshold(val)
      detectorRef.current?.setRelativeThresholdDb(val)
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

  const handleClearMs = useCallback(
    ([val]: number[]) => {
      setClearMs(val)
      detectorRef.current?.setClearMs(val)
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

  const handleNeighborhoodBins = useCallback(
    ([val]: number[]) => {
      setNeighborhoodBins(val)
      detectorRef.current?.setNeighborhoodBins(val)
    },
    [detectorRef]
  )

  const handleMinFreq = useCallback(
    ([val]: number[]) => {
      setMinFreq(val)
      detectorRef.current?.setFrequencyRange(val, maxFreq)
    },
    [detectorRef, maxFreq]
  )

  const handleMaxFreq = useCallback(
    ([val]: number[]) => {
      setMaxFreq(val)
      detectorRef.current?.setFrequencyRange(minFreq, val)
    },
    [detectorRef, minFreq]
  )

  const handleAWeighting = useCallback(
    (val: boolean) => {
      setAWeighting(val)
      detectorRef.current?.setAWeightingEnabled(val)
    },
    [detectorRef]
  )

  const handleResetAll = useCallback(() => {
    const d = DET_DEFAULTS
    const det = detectorRef.current
    if (det) {
      det.setThresholdMode(d.thresholdMode)
      det.setThresholdDb(d.thresholdDb)
      det.setRelativeThresholdDb(d.relativeThresholdDb)
      det.setFftSize(d.fftSize)
      det.setSustainMs(d.sustainMs)
      det.setClearMs(d.clearMs)
      det.setProminenceDb(d.prominenceDb)
      det.setNeighborhoodBins(d.neighborhoodBins)
      det.setFrequencyRange(d.minFrequencyHz, d.maxFrequencyHz)
      det.setAWeightingEnabled(d.aWeightingEnabled)
    }
    setThresholdMode(d.thresholdMode)
    setThreshold(d.thresholdDb)
    setRelativeThreshold(d.relativeThresholdDb)
    setFftSize(String(d.fftSize))
    setSustain(d.sustainMs)
    setClearMs(d.clearMs)
    setProminence(d.prominenceDb)
    setNeighborhoodBins(d.neighborhoodBins)
    setMinFreq(d.minFrequencyHz)
    setMaxFreq(d.maxFrequencyHz)
    setAWeighting(d.aWeightingEnabled)
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
          <SheetDescription className="sr-only">
            Configure the feedback detection engine and session settings.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-8 pb-8">
          {/* Thresholding */}
          <Section title="Thresholding">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground/90">Mode</span>
                <span className="font-mono text-[11px] text-primary capitalize">{thresholdMode}</span>
              </div>
              <Select value={thresholdMode} onValueChange={handleThresholdMode}>
                <SelectTrigger className="h-9 font-mono text-xs bg-secondary/50 border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hybrid">Hybrid (recommended)</SelectItem>
                  <SelectItem value="absolute">Absolute only</SelectItem>
                  <SelectItem value="relative">Relative to floor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SettingRow label="Absolute Threshold" description="Hard floor for peak detection" value={`${threshold} dB`}>
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

            {(thresholdMode === "hybrid" || thresholdMode === "relative") && (
              <SettingRow label="Relative Threshold" description="dB above noise floor" value={`+${relativeThreshold} dB`}>
                <Slider
                  value={[relativeThreshold]}
                  onValueChange={handleRelativeThreshold}
                  min={6}
                  max={40}
                  step={1}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
                <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                  <span>+6 dB</span>
                  <span>+40 dB</span>
                </div>
              </SettingRow>
            )}
          </Section>

          {/* Peak Validation */}
          <Section title="Peak Validation">
            <SettingRow label="Prominence (Crest)" description="Required dB above neighborhood average" value={`${prominence} dB`}>
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

            <SettingRow label="Neighborhood Bins" description="Bins on each side for crest calculation" value={`${neighborhoodBins}`}>
              <Slider
                value={[neighborhoodBins]}
                onValueChange={handleNeighborhoodBins}
                min={2}
                max={12}
                step={1}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>2</span>
                <span>12</span>
              </div>
            </SettingRow>
          </Section>

          {/* Timing */}
          <Section title="Timing">
            <SettingRow label="Sustain" description="Peak must hold this long to confirm" value={`${sustain} ms`}>
              <Slider
                value={[sustain]}
                onValueChange={handleSustain}
                min={100}
                max={1500}
                step={50}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>100 ms</span>
                <span>1500 ms</span>
              </div>
            </SettingRow>

            <SettingRow label="Clear Delay" description="Peak must be gone this long to clear" value={`${clearMs} ms`}>
              <Slider
                value={[clearMs]}
                onValueChange={handleClearMs}
                min={50}
                max={1000}
                step={25}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>50 ms</span>
                <span>1000 ms</span>
              </div>
            </SettingRow>
          </Section>

          {/* Analysis */}
          <Section title="Analysis">
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

            <SettingRow label="Min Frequency" value={`${minFreq} Hz`}>
              <Slider
                value={[minFreq]}
                onValueChange={handleMinFreq}
                min={20}
                max={500}
                step={10}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>20 Hz</span>
                <span>500 Hz</span>
              </div>
            </SettingRow>

            <SettingRow label="Max Frequency" value={minFreq >= maxFreq ? "Invalid" : `${(maxFreq / 1000).toFixed(1)} kHz`}>
              <Slider
                value={[maxFreq]}
                onValueChange={handleMaxFreq}
                min={4000}
                max={20000}
                step={500}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
                <span>4 kHz</span>
                <span>20 kHz</span>
              </div>
            </SettingRow>

            <ToggleRow
              label="A-Weighting"
              description="Apply psychoacoustic curve to match human hearing"
              checked={aWeighting}
              onChange={handleAWeighting}
            />
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
