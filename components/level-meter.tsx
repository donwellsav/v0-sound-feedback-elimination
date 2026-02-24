"use client"

import { useMemo } from "react"

interface LevelMeterProps {
  level: number // in dB, -100 to 0
}

export function LevelMeter({ level }: LevelMeterProps) {
  const segments = useMemo(() => {
    const count = 20
    const result = []
    for (let i = 0; i < count; i++) {
      const threshold = -60 + (i / count) * 60 // range: -60 to 0 dB
      const isActive = level > threshold
      let activeColor: string
      let inactiveColor: string

      if (i >= count * 0.9) {
        activeColor = "bg-feedback-critical"
        inactiveColor = "bg-feedback-critical/15"
      } else if (i >= count * 0.75) {
        activeColor = "bg-feedback-danger"
        inactiveColor = "bg-feedback-danger/15"
      } else if (i >= count * 0.6) {
        activeColor = "bg-feedback-warning"
        inactiveColor = "bg-feedback-warning/15"
      } else {
        activeColor = "bg-feedback-safe"
        inactiveColor = "bg-feedback-safe/15"
      }

      result.push({ activeColor, inactiveColor, isActive })
    }
    return result
  }, [level])

  const displayLevel = Math.max(-100, Math.min(0, level))

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider shrink-0">
        IN
      </span>
      <div className="flex items-center gap-px">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`w-[3px] h-[10px] rounded-[1px] transition-colors duration-75 ${
              seg.isActive ? seg.activeColor : seg.inactiveColor
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-[9px] text-foreground tabular-nums w-10 text-right shrink-0">
        {displayLevel > -100 ? `${displayLevel.toFixed(0)}` : "-inf"}
        <span className="text-muted-foreground ml-px">dB</span>
      </span>
    </div>
  )
}
