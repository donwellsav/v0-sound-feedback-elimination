"use client"

import { Button } from "@/components/ui/button"
import { X, Copy } from "lucide-react"
import type { FilterNode } from "@/hooks/use-audio-engine"

interface FilterControlsProps {
  filters: FilterNode[]
  onRemoveFilter: (id: string) => void
  onClearAll: () => void
}

function formatFreq(freq: number): string {
  return freq >= 1000 ? `${(freq / 1000).toFixed(2)} kHz` : `${Math.round(freq)} Hz`
}

function FilterCard({
  filter,
  index,
  onRemove,
}: {
  filter: FilterNode
  index: number
  onRemove: () => void
}) {
  const copyToClipboard = () => {
    const text = `${formatFreq(filter.frequency)} | ${filter.gain.toFixed(1)} dB | Q ${filter.q.toFixed(1)}`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all bg-[#121212] border-primary/20">
      {/* Index */}
      <span className="font-mono text-[10px] text-primary/60 shrink-0 w-4 text-center">
        {index + 1}
      </span>

      {/* Frequency */}
      <span className="font-mono text-sm text-primary font-bold shrink-0">
        {formatFreq(filter.frequency)}
      </span>

      {/* Gain and Q */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <span className="font-mono text-[10px] text-muted-foreground">
          {filter.gain.toFixed(1)} dB
        </span>
        <span className="text-muted-foreground/20">|</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          Q {filter.q.toFixed(0)}
        </span>
      </div>

      {/* Copy button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground/40 hover:text-primary shrink-0"
        onClick={copyToClipboard}
        aria-label={`Copy filter ${index + 1} values`}
      >
        <Copy className="h-3 w-3" />
      </Button>

      {/* Remove */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground/40 hover:text-destructive shrink-0"
        onClick={onRemove}
        aria-label={`Remove recommendation ${index + 1}`}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function FilterControls({
  filters,
  onRemoveFilter,
  onClearAll,
}: FilterControlsProps) {
  if (filters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-muted-foreground text-sm">No recommendations yet</div>
        <div className="text-muted-foreground/50 text-xs mt-1">
          Detected feedback frequencies will appear here as recommended notch cuts to dial into your console
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
          {filters.length} recommended cut{filters.length !== 1 ? "s" : ""}
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
      <p className="text-[10px] text-muted-foreground/50 font-sans leading-relaxed">
        Dial these notch cuts into your mixing console to eliminate feedback. Tap the copy icon to copy values.
      </p>
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
