"use client"

import { useMemo, useCallback, useRef } from "react"

interface LevelMeterProps {
  level: number
  gainDb: number
  onGainChange: (db: number) => void
}

const SEGMENT_COUNT = 24
const MIN_DB = -60
const MAX_DB = 0
const GAIN_MIN = -20
const GAIN_MAX = 20
const METER_WIDTH = 120
const METER_HEIGHT = 14

export function LevelMeter({ level, gainDb, onGainChange }: LevelMeterProps) {
  const isDragging = useRef(false)
  const meterRef = useRef<HTMLDivElement>(null)

  const segments = useMemo(() => {
    const result = []
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const threshold = MIN_DB + (i / SEGMENT_COUNT) * (MAX_DB - MIN_DB)
      const isActive = level > threshold
      let activeColor: string
      let inactiveColor: string

      if (i >= SEGMENT_COUNT * 0.9) {
        activeColor = "bg-feedback-critical"
        inactiveColor = "bg-feedback-critical/15"
      } else if (i >= SEGMENT_COUNT * 0.75) {
        activeColor = "bg-feedback-danger"
        inactiveColor = "bg-feedback-danger/15"
      } else if (i >= SEGMENT_COUNT * 0.6) {
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

  // Gain slider thumb position (0..1)
  const gainNorm = (gainDb - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)

  const clientXToGain = useCallback((clientX: number) => {
    const el = meterRef.current
    if (!el) return gainDb
    const rect = el.getBoundingClientRect()
    const norm = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(GAIN_MIN + norm * (GAIN_MAX - GAIN_MIN))
  }, [gainDb])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      onGainChange(clientXToGain(e.clientX))
    },
    [clientXToGain, onGainChange]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      onGainChange(clientXToGain(e.clientX))
    },
    [clientXToGain, onGainChange]
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  // Double-click to reset gain to 0
  const handleDoubleClick = useCallback(() => {
    onGainChange(0)
  }, [onGainChange])

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider shrink-0">
        IN
      </span>

      {/* Meter + gain slider combined */}
      <div
        ref={meterRef}
        className="relative cursor-ew-resize select-none touch-none"
        style={{ width: METER_WIDTH, height: METER_HEIGHT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        title={`Input gain: ${gainDb > 0 ? "+" : ""}${gainDb} dB (double-click to reset)`}
      >
        {/* LED segments */}
        <div className="flex items-center gap-px h-full">
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`flex-1 h-[10px] rounded-[1px] transition-colors duration-75 ${
                seg.isActive ? seg.activeColor : seg.inactiveColor
              }`}
            />
          ))}
        </div>

        {/* Zero-dB gain marker (center line) */}
        <div
          className="absolute top-0 h-full w-px bg-muted-foreground/30"
          style={{ left: `${((0 - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)) * 100}%` }}
        />

        {/* Gain slider thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
          style={{ left: `${gainNorm * 100}%` }}
        >
          <div className="w-[3px] h-[16px] rounded-sm bg-foreground shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
        </div>
      </div>

      {/* Readout: level + gain */}
      <div className="flex flex-col items-end shrink-0">
        <span className="font-mono text-[9px] text-foreground tabular-nums leading-tight">
          {displayLevel > -100 ? `${displayLevel.toFixed(0)}` : "-inf"}
          <span className="text-muted-foreground ml-px">dB</span>
        </span>
        <span
          className={`font-mono text-[8px] leading-tight tabular-nums ${
            gainDb === 0
              ? "text-muted-foreground"
              : gainDb > 0
                ? "text-feedback-warning"
                : "text-primary"
          }`}
        >
          {gainDb > 0 ? "+" : ""}{gainDb}
          <span className="text-muted-foreground ml-px">gain</span>
        </span>
      </div>
    </div>
  )
}
