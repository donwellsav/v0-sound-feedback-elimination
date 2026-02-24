"use client"

import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { X } from "lucide-react"
import type { FilterNode } from "@/hooks/use-audio-engine"

interface FilterControlsProps {
  filters: FilterNode[]
  onUpdateFilter: (
    id: string,
    updates: Partial<Pick<FilterNode, "frequency" | "gain" | "q" | "enabled">>
  ) => void
  onRemoveFilter: (id: string) => void
  onClearAll: () => void
}

function formatFreq(freq: number): string {
  return freq >= 1000 ? `${(freq / 1000).toFixed(2)} kHz` : `${Math.round(freq)} Hz`
}

function FilterCard({
  filter,
  index,
  onUpdate,
  onRemove,
}: {
  filter: FilterNode
  index: number
  onUpdate: (updates: Partial<Pick<FilterNode, "frequency" | "gain" | "q" | "enabled">>) => void
  onRemove: () => void
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        filter.enabled
          ? "bg-secondary border-feedback-danger/30"
          : "bg-secondary/50 border-border opacity-60"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              filter.enabled ? "bg-feedback-danger animate-pulse" : "bg-muted-foreground"
            }`}
          />
          <span className="font-mono text-xs text-foreground">
            {"F" + (index + 1)}
          </span>
          <span className="font-mono text-sm text-feedback-warning font-medium">
            {formatFreq(filter.frequency)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={filter.enabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
            className="scale-75"
            aria-label={`Toggle filter ${index + 1}`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove filter ${index + 1}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Frequency
            </label>
            <span className="font-mono text-[10px] text-foreground">
              {formatFreq(filter.frequency)}
            </span>
          </div>
          <Slider
            value={[Math.log10(filter.frequency)]}
            onValueChange={([val]) => onUpdate({ frequency: Math.pow(10, val) })}
            min={Math.log10(20)}
            max={Math.log10(20000)}
            step={0.001}
            className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Gain
            </label>
            <span className="font-mono text-[10px] text-foreground">
              {filter.gain.toFixed(1)} dB
            </span>
          </div>
          <Slider
            value={[filter.gain]}
            onValueChange={([val]) => onUpdate({ gain: val })}
            min={-30}
            max={6}
            step={0.5}
            className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Q Factor
            </label>
            <span className="font-mono text-[10px] text-foreground">
              {filter.q.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[filter.q]}
            onValueChange={([val]) => onUpdate({ q: val })}
            min={0.5}
            max={100}
            step={0.5}
            className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
          />
        </div>
      </div>
    </div>
  )
}

export function FilterControls({
  filters,
  onUpdateFilter,
  onRemoveFilter,
  onClearAll,
}: FilterControlsProps) {
  if (filters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-muted-foreground text-sm">No filters active</div>
        <div className="text-muted-foreground/60 text-xs mt-1">
          Click on a detected feedback frequency or the spectrum to add a notch filter
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
          {filters.length} {"filter" + (filters.length !== 1 ? "s" : "")} active
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground hover:text-destructive"
          onClick={onClearAll}
        >
          Clear All
        </Button>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {filters.map((filter, index) => (
          <FilterCard
            key={filter.id}
            filter={filter}
            index={index}
            onUpdate={(updates) => onUpdateFilter(filter.id, updates)}
            onRemove={() => onRemoveFilter(filter.id)}
          />
        ))}
      </div>
    </div>
  )
}
