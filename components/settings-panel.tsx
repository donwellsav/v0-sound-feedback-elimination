"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Settings, RotateCcw } from "lucide-react"

export interface AppSettings {
  // Retention times (seconds, 0 = Infinity / until cleared)
  retentionLow: number
  retentionMedium: number
  retentionHigh: number
  retentionCritical: number

  // Auto-filter recommendations
  autoFilterEnabled: boolean
  autoFilterThreshold: number // dB: detections above this trigger auto-filter recs

  // FeedbackDetector engine settings
  fftSize: number
  sustainMs: number
  prominenceDb: number
  noiseFloorEnabled: boolean

  // Display
  showPeakHold: boolean
  clearOnStart: boolean
  clearFiltersOnStart: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  retentionLow: 10,
  retentionMedium: 15,
  retentionHigh: 0,
  retentionCritical: 0,

  autoFilterEnabled: true,
  autoFilterThreshold: -25,

  fftSize: 2048,
  sustainMs: 400,
  prominenceDb: 15,
  noiseFloorEnabled: true,

  showPeakHold: true,
  clearOnStart: true,
  clearFiltersOnStart: false,
}

function formatRetention(value: number): string {
  if (value === 0) return "Until cleared"
  return `${value}s`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border pb-1.5">
        {title}
      </h3>
      {children}
    </div>
  )
}

function SettingRow({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-foreground/80">{label}</span>
        {value && (
          <span className="font-mono text-[10px] text-primary tabular-nums">{value}</span>
        )}
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
        <span className="text-[11px] text-foreground/80">{label}</span>
        {description && (
          <span className="text-[9px] text-muted-foreground/60">{description}</span>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75 shrink-0" />
    </div>
  )
}

interface SettingsPanelProps {
  settings: AppSettings
  noiseFloorDb?: number | null
  effectiveThresholdDb?: number
  onUpdateSettings: (updates: Partial<AppSettings>) => void
  onResetDefaults: () => void
}

export function SettingsPanel({ settings, noiseFloorDb, effectiveThresholdDb, onUpdateSettings, onResetDefaults }: SettingsPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-80 max-h-[80vh] overflow-y-auto p-4 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">
            Settings
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground"
            onClick={onResetDefaults}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>

        {/* Engine / Detection */}
        <Section title="Detection Engine">
          <SettingRow label="FFT Size" value={`${settings.fftSize}`}>
            <Slider
              value={[Math.log2(settings.fftSize)]}
              onValueChange={([v]) => onUpdateSettings({ fftSize: Math.pow(2, v) })}
              min={10}
              max={13}
              step={1}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <div className="text-[9px] text-muted-foreground/50 font-mono">
            {settings.fftSize === 1024 && "Fast response, low resolution"}
            {settings.fftSize === 2048 && "Balanced (default)"}
            {settings.fftSize === 4096 && "Good resolution, moderate latency"}
            {settings.fftSize === 8192 && "High resolution, slower response"}
          </div>

          <SettingRow label="Sustain Time" value={`${settings.sustainMs} ms`}>
            <Slider
              value={[settings.sustainMs]}
              onValueChange={([v]) => onUpdateSettings({ sustainMs: v })}
              min={100}
              max={1500}
              step={50}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <div className="text-[9px] text-muted-foreground/50 font-mono">
            How long a peak must persist before triggering.
          </div>

          <SettingRow label="Prominence (Crest)" value={`${settings.prominenceDb} dB`}>
            <Slider
              value={[settings.prominenceDb]}
              onValueChange={([v]) => onUpdateSettings({ prominenceDb: v })}
              min={5}
              max={30}
              step={1}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <div className="text-[9px] text-muted-foreground/50 font-mono">
            How far above the local average a peak must stand.
          </div>

          <ToggleRow
            label="Adaptive noise floor"
            description="Auto-adjusting median noise floor tracker"
            checked={settings.noiseFloorEnabled}
            onChange={(v) => onUpdateSettings({ noiseFloorEnabled: v })}
          />

          {/* Live telemetry readout */}
          <div className="rounded-md border border-border/40 bg-background/50 p-2 space-y-1">
            <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">Live Telemetry</span>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Noise Floor</span>
              <span className="font-mono text-[10px] text-primary tabular-nums">
                {noiseFloorDb != null ? `${noiseFloorDb.toFixed(1)} dB` : "---"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Effective Threshold</span>
              <span className="font-mono text-[10px] text-feedback-warning tabular-nums">
                {effectiveThresholdDb != null ? `${effectiveThresholdDb.toFixed(1)} dB` : "---"}
              </span>
            </div>
          </div>
        </Section>

        {/* Marker Retention */}
        <Section title="Marker Retention">
          <SettingRow label="LOW detections" value={formatRetention(settings.retentionLow)}>
            <Slider
              value={[settings.retentionLow]}
              onValueChange={([v]) => onUpdateSettings({ retentionLow: v })}
              min={0}
              max={60}
              step={5}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <SettingRow label="MEDIUM detections" value={formatRetention(settings.retentionMedium)}>
            <Slider
              value={[settings.retentionMedium]}
              onValueChange={([v]) => onUpdateSettings({ retentionMedium: v })}
              min={0}
              max={60}
              step={5}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <SettingRow label="HIGH detections" value={formatRetention(settings.retentionHigh)}>
            <Slider
              value={[settings.retentionHigh]}
              onValueChange={([v]) => onUpdateSettings({ retentionHigh: v })}
              min={0}
              max={120}
              step={5}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <SettingRow label="CRITICAL detections" value={formatRetention(settings.retentionCritical)}>
            <Slider
              value={[settings.retentionCritical]}
              onValueChange={([v]) => onUpdateSettings({ retentionCritical: v })}
              min={0}
              max={120}
              step={5}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
        </Section>

        {/* Auto Recommendations */}
        <Section title="Auto Recommendations">
          <ToggleRow
            label="Auto-create recommendations"
            description="Auto-add filter recs for severe feedback"
            checked={settings.autoFilterEnabled}
            onChange={(v) => onUpdateSettings({ autoFilterEnabled: v })}
          />
          <div className="flex items-center justify-between py-0.5">
            <div className="flex flex-col">
              <span className="text-[11px] text-foreground/80">Trigger line</span>
              <span className="text-[9px] text-muted-foreground/60">Drag the red line on the spectrum</span>
            </div>
            <span className="font-mono text-[10px] text-primary tabular-nums">{settings.autoFilterThreshold} dB</span>
          </div>
        </Section>

        {/* Display */}
        <Section title="Display">
          <ToggleRow
            label="Peak hold trace"
            description="Faint trace showing max levels on spectrum"
            checked={settings.showPeakHold}
            onChange={(v) => onUpdateSettings({ showPeakHold: v })}
          />
          <ToggleRow
            label="Clear detections on start"
            checked={settings.clearOnStart}
            onChange={(v) => onUpdateSettings({ clearOnStart: v })}
          />
          <ToggleRow
            label="Clear recommendations on start"
            checked={settings.clearFiltersOnStart}
            onChange={(v) => onUpdateSettings({ clearFiltersOnStart: v })}
          />
        </Section>
      </PopoverContent>
    </Popover>
  )
}
