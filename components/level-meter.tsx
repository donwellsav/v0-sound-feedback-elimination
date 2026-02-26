"use client"

import { useMemo, useCallback, useRef } from "react"
import { AUDIO_CONSTANTS, VISUAL_CONSTANTS, UI_CLASSES } from "@/lib/constants"

interface LevelMeterProps {
  level: number
  gainDb: number
  onGainChange: (db: number) => void
}

const { LEVEL_METER, GAIN_MIN_DB, GAIN_MAX_DB } = AUDIO_CONSTANTS
const { SEGMENT_COUNT, MIN_DB, MAX_DB, WIDTH: METER_WIDTH, HEIGHT: METER_HEIGHT } = LEVEL_METER

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
        activeColor = UI_CLASSES.METER.CRITICAL
        inactiveColor = UI_CLASSES.METER.CRITICAL_BG
      } else if (i >= SEGMENT_COUNT * 0.75) {
        activeColor = UI_CLASSES.METER.DANGER
        inactiveColor = UI_CLASSES.METER.DANGER_BG
      } else if (i >= SEGMENT_COUNT * 0.6) {
        activeColor = UI_CLASSES.METER.WARNING
        inactiveColor = UI_CLASSES.METER.WARNING_BG
      } else {
        activeColor = UI_CLASSES.METER.SAFE
        inactiveColor = UI_CLASSES.METER.SAFE_BG
      }

      result.push({ activeColor, inactiveColor, isActive })
    }
    return result
  }, [level])

  const displayLevel = Math.max(-100, Math.min(0, level))

  // Gain slider thumb position (0..1)
  const gainNorm = (gainDb - GAIN_MIN_DB) / (GAIN_MAX_DB - GAIN_MIN_DB)

  const clientXToGain = useCallback((clientX: number) => {
    const el = meterRef.current
    if (!el) return gainDb
    const rect = el.getBoundingClientRect()
    const norm = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(GAIN_MIN_DB + norm * (GAIN_MAX_DB - GAIN_MIN_DB))
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
          style={{ left: `${((0 - GAIN_MIN_DB) / (GAIN_MAX_DB - GAIN_MIN_DB)) * 100}%` }}
        />

        {/* Gain slider thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
          style={{ left: `${gainNorm * 100}%` }}
        >
          <div
            className="w-[3px] h-[16px] rounded-sm bg-foreground"
            style={{ boxShadow: `0 0 4px ${VISUAL_CONSTANTS.COLORS.METER_THUMB_SHADOW}` }}
          />
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
