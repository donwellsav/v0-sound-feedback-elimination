"use client"

import { useMemo } from "react"

interface LevelMeterProps {
  level: number // in dB, -100 to 0
  label?: string
}

export function LevelMeter({ level, label = "INPUT" }: LevelMeterProps) {
  const segments = useMemo(() => {
    const count = 30
    const result = []
    for (let i = 0; i < count; i++) {
      const threshold = -100 + (i / count) * 100
      const isActive = level > threshold
      let color: string

      if (i >= count * 0.9) {
        color = isActive ? "bg-feedback-critical" : "bg-feedback-critical/15"
      } else if (i >= count * 0.75) {
        color = isActive ? "bg-feedback-danger" : "bg-feedback-danger/15"
      } else if (i >= count * 0.6) {
        color = isActive ? "bg-feedback-warning" : "bg-feedback-warning/15"
      } else {
        color = isActive ? "bg-feedback-safe" : "bg-feedback-safe/15"
      }

      result.push({ color, isActive })
    }
    return result
  }, [level])

  const displayLevel = Math.max(-100, Math.min(0, level))

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-end gap-px h-40 px-1">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-all duration-75 ${seg.color}`}
            style={{
              height: `${((i + 1) / segments.length) * 100}%`,
              opacity: seg.isActive ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-foreground tabular-nums">
        {displayLevel > -100 ? `${displayLevel.toFixed(1)}` : "-inf"} <span className="text-muted-foreground text-[10px]">dB</span>
      </span>
    </div>
  )
}
