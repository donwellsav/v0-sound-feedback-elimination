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
  // Auto recommendations (UI-level, does not touch detector)
  autoFilterEnabled: boolean
  autoFilterThreshold: number

  // History retention (single value in seconds, 0 = until cleared)
  historyRetention: number

  // Display & workflow
  showPeakHold: boolean
  clearOnStart: boolean
  clearFiltersOnStart: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoFilterEnabled: true,
  autoFilterThreshold: -30,

  historyRetention: 0, // keep until cleared (most useful for documenting a venue)

  showPeakHold: true,
  clearOnStart: true,
  clearFiltersOnStart: false,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/60 pb-1.5">
        {title}
      </h3>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  )
}

function SettingRow({
  label,
  hint,
  value,
  children,
}: {
  label: string
  hint?: string
  value?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] text-foreground/80">{label}</span>
          {hint && <span className="text-[9px] text-muted-foreground/50">{hint}</span>}
        </div>
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
          <span className="text-[9px] text-muted-foreground/50 leading-tight">{description}</span>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75 shrink-0" />
    </div>
  )
}

function formatRetention(value: number): string {
  if (value === 0) return "Until cleared"
  if (value < 60) return `${value}s`
  return `${Math.round(value / 60)}m`
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
        className="w-72 max-h-[80vh] overflow-y-auto p-4 space-y-5"
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

        {/* Engine telemetry (read-only) */}
        <Section title="Detection Engine">
          <div className="rounded-md border border-border/40 bg-background/50 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Noise Floor</span>
              <span className="font-mono text-[10px] text-primary tabular-nums">
                {noiseFloorDb != null ? `${noiseFloorDb.toFixed(1)} dB` : "Calibrating..."}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Eff. Threshold</span>
              <span className="font-mono text-[10px] text-[var(--feedback-warning)] tabular-nums">
                {effectiveThresholdDb != null ? `${effectiveThresholdDb.toFixed(1)} dB` : "---"}
              </span>
            </div>
            <div className="text-[8px] text-muted-foreground/40 font-mono leading-tight pt-1 border-t border-border/30">
              FFT 2048 / Sustain 400ms / Prominence 15dB / Adaptive noise floor / Hybrid threshold
            </div>
          </div>
        </Section>

        {/* Auto recommendations */}
        <Section title="Auto Recommendations">
          <ToggleRow
            label="Auto-add recommendations"
            description="Automatically suggest notch filters when feedback is detected above the trigger line"
            checked={settings.autoFilterEnabled}
            onChange={(v) => onUpdateSettings({ autoFilterEnabled: v })}
          />
          <div className="flex items-center justify-between py-0.5">
            <div className="flex flex-col">
              <span className="text-[11px] text-foreground/80">Alert level</span>
              <span className="text-[9px] text-muted-foreground/50">Drag the red line on the spectrum</span>
            </div>
            <span className="font-mono text-[10px] text-primary tabular-nums">{settings.autoFilterThreshold} dB</span>
          </div>
        </Section>

        {/* History */}
        <Section title="History">
          <SettingRow
            label="Keep detections for"
            hint="How long stale markers stay visible"
            value={formatRetention(settings.historyRetention)}
          >
            <Slider
              value={[settings.historyRetention]}
              onValueChange={([v]) => onUpdateSettings({ historyRetention: v })}
              min={0}
              max={120}
              step={5}
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            />
          </SettingRow>
        </Section>

        {/* Display & session */}
        <Section title="Display">
          <ToggleRow
            label="Peak hold trace"
            description="Shows max levels as a faint trace on the spectrum"
            checked={settings.showPeakHold}
            onChange={(v) => onUpdateSettings({ showPeakHold: v })}
          />
          <ToggleRow
            label="Clear detections on start"
            description="Remove all markers when engine starts"
            checked={settings.clearOnStart}
            onChange={(v) => onUpdateSettings({ clearOnStart: v })}
          />
          <ToggleRow
            label="Clear recommendations on start"
            description="Remove all filter recs when engine starts"
            checked={settings.clearFiltersOnStart}
            onChange={(v) => onUpdateSettings({ clearFiltersOnStart: v })}
          />
        </Section>
      </PopoverContent>
    </Popover>
  )
}
