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

  // Auto-filter
  autoFilterEnabled: boolean
  autoFilterThreshold: number // dB: detections above this trigger auto-filter
  filterGainHigh: number
  filterQHigh: number
  filterGainCritical: number
  filterQCritical: number

  // Detection
  detectionSensitivity: number // 1-10 scale

  // Display
  showPeakHold: boolean
  clearOnStart: boolean
  clearFiltersOnStart: boolean

  // FFT
  fftSize: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  retentionLow: 10,
  retentionMedium: 15,
  retentionHigh: 0, // 0 = until cleared
  retentionCritical: 0,

  autoFilterEnabled: true,
  autoFilterThreshold: -25,
  filterGainHigh: -10,
  filterQHigh: 25,
  filterGainCritical: -18,
  filterQCritical: 40,

  detectionSensitivity: 5,

  showPeakHold: true,
  clearOnStart: true,
  clearFiltersOnStart: false,

  fftSize: 8192,
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
  onUpdateSettings: (updates: Partial<AppSettings>) => void
  onResetDefaults: () => void
}

export function SettingsPanel({ settings, onUpdateSettings, onResetDefaults }: SettingsPanelProps) {
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

        {/* Auto-Filter */}
        <Section title="Auto-Filter">
          <ToggleRow
            label="Auto-create notch filters"
            description="Automatically add filters for severe feedback"
            checked={settings.autoFilterEnabled}
            onChange={(v) => onUpdateSettings({ autoFilterEnabled: v })}
          />
          <SettingRow label="Trigger threshold" value={`${settings.autoFilterThreshold} dB`}>
            <Slider
              value={[settings.autoFilterThreshold]}
              onValueChange={([v]) => onUpdateSettings({ autoFilterThreshold: v })}
              min={-40}
              max={-10}
              step={1}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <div className="rounded-md border border-border/50 p-2 space-y-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">HIGH preset</span>
            <SettingRow label="Gain" value={`${settings.filterGainHigh} dB`}>
              <Slider
                value={[settings.filterGainHigh]}
                onValueChange={([v]) => onUpdateSettings({ filterGainHigh: v })}
                min={-30}
                max={-3}
                step={1}
                className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
              />
            </SettingRow>
            <SettingRow label="Q" value={`${settings.filterQHigh}`}>
              <Slider
                value={[settings.filterQHigh]}
                onValueChange={([v]) => onUpdateSettings({ filterQHigh: v })}
                min={5}
                max={80}
                step={1}
                className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
              />
            </SettingRow>
          </div>
          <div className="rounded-md border border-border/50 p-2 space-y-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">CRITICAL preset</span>
            <SettingRow label="Gain" value={`${settings.filterGainCritical} dB`}>
              <Slider
                value={[settings.filterGainCritical]}
                onValueChange={([v]) => onUpdateSettings({ filterGainCritical: v })}
                min={-30}
                max={-3}
                step={1}
                className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
              />
            </SettingRow>
            <SettingRow label="Q" value={`${settings.filterQCritical}`}>
              <Slider
                value={[settings.filterQCritical]}
                onValueChange={([v]) => onUpdateSettings({ filterQCritical: v })}
                min={5}
                max={80}
                step={1}
                className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
              />
            </SettingRow>
          </div>
        </Section>

        {/* Detection */}
        <Section title="Detection">
          <SettingRow label="Sensitivity" value={`${settings.detectionSensitivity}/10`}>
            <Slider
              value={[settings.detectionSensitivity]}
              onValueChange={([v]) => onUpdateSettings({ detectionSensitivity: v })}
              min={1}
              max={10}
              step={1}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <SettingRow label="FFT Size" value={`${settings.fftSize}`}>
            <Slider
              value={[Math.log2(settings.fftSize)]}
              onValueChange={([v]) => onUpdateSettings({ fftSize: Math.pow(2, v) })}
              min={11}
              max={14}
              step={1}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
          <div className="text-[9px] text-muted-foreground/50 font-mono">
            {settings.fftSize === 2048 && "Fast response, low resolution"}
            {settings.fftSize === 4096 && "Balanced response and resolution"}
            {settings.fftSize === 8192 && "Good resolution, standard (default)"}
            {settings.fftSize === 16384 && "High resolution, slower response"}
          </div>
        </Section>

        {/* Display */}
        <Section title="Display & Behavior">
          <ToggleRow
            label="Show peak hold"
            description="Faint trace showing max levels on spectrum"
            checked={settings.showPeakHold}
            onChange={(v) => onUpdateSettings({ showPeakHold: v })}
          />
          <ToggleRow
            label="Clear detections on start"
            description="Remove all markers when starting analysis"
            checked={settings.clearOnStart}
            onChange={(v) => onUpdateSettings({ clearOnStart: v })}
          />
          <ToggleRow
            label="Clear filters on start"
            description="Remove all notch filters when starting analysis"
            checked={settings.clearFiltersOnStart}
            onChange={(v) => onUpdateSettings({ clearFiltersOnStart: v })}
          />
        </Section>
      </PopoverContent>
    </Popover>
  )
}
