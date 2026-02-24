"use client"

import { Button } from "@/components/ui/button"
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
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-all bg-secondary border-feedback-danger/30">
      {/* Status dot */}
      <div className="w-2 h-2 rounded-full shrink-0 bg-feedback-danger animate-pulse" />

      {/* Filter label */}
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
        {"F" + (index + 1)}
      </span>

      {/* Frequency */}
      <span className="font-mono text-sm text-feedback-warning font-bold shrink-0">
        {formatFreq(filter.frequency)}
      </span>

      {/* Gain and Q values */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <span className="font-mono text-[10px] text-muted-foreground">
          {filter.gain.toFixed(0)} dB
        </span>
        <span className="text-muted-foreground/30">|</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          Q {filter.q.toFixed(0)}
        </span>
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
        onClick={onRemove}
        aria-label={`Remove filter ${index + 1}`}
      >
        <X className="h-3 w-3" />
      </Button>
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
      <div className="space-y-1.5">
        {filters.map((filter, index) => (
          <FilterCard
            key={filter.id}
            filter={filter}
            index={index}
            onRemove={() => onRemoveFilter(filter.id)}
          />
        ))}
      </div>
    </div>
  )
}
