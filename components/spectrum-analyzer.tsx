"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import type { FeedbackDetection, HistoricalDetection } from "@/hooks/use-audio-engine"
import { AUDIO_CONSTANTS, VISUAL_CONSTANTS, LAYOUT_CONSTANTS } from "@/lib/constants"
import { freqToX, xToFreq, dbToY, yToDb } from "@/lib/audio-utils"

interface SpectrumAnalyzerProps {
  frequencyData: Float32Array | null
  peakData: Float32Array | null
  feedbackDetections: FeedbackDetection[]
  historicalDetections?: HistoricalDetection[]
  holdTime?: number
  sampleRate: number
  fftSize: number
  isFrozen?: boolean
  showPeakHold?: boolean
  noiseFloorDb?: number | null
  effectiveThresholdDb?: number | null
  onThresholdDrag?: (newEffectiveDb: number) => void
  onNoiseFloorDrag?: (newDb: number) => void
  onNoiseFloorDragEnd?: () => void
}

const { GRID_FREQUENCIES, GRID_DB_VALUES, MIN_DB, MAX_DB } = AUDIO_CONSTANTS
const {
  COLORS,
  GRAB_ZONE_PX,
  PULSE_SIZE_BASE,
  PULSE_SIZE_VARIATION,
  GLOW_SCALE,
  HISTORICAL_MARKER_SIZE,
  HISTORICAL_MARKER_CORE_SIZE,
  PULSE_INTERVAL_MS,
  LINE_STYLES,
  FONTS,
  OFFSETS,
} = VISUAL_CONSTANTS

export function SpectrumAnalyzer({
  frequencyData,
  peakData,
  feedbackDetections,
  historicalDetections = [],
  holdTime = 10,
  sampleRate,
  fftSize,
  isFrozen = false,
  showPeakHold = true,
  noiseFloorDb = null,
  effectiveThresholdDb = null,
  onThresholdDrag,
  onNoiseFloorDrag,
  onNoiseFloorDragEnd,
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoveredFreqRef = useRef<number | null>(null)
  const hoveredDbRef = useRef<number | null>(null)
  const [crosshairTick, setCrosshairTick] = useState(0)
  const [canvasSize, setCanvasSize] = useState(0)
  const draggingRef = useRef<"threshold" | "noisefloor" | null>(null)

  const detectNearLine = useCallback(
    (clientY: number, rectTop: number, rectHeight: number): "threshold" | "noisefloor" | null => {
      const y = clientY - rectTop
      let closestDist = Infinity
      let closestLine: "threshold" | "noisefloor" | null = null

      if (effectiveThresholdDb != null) {
        const threshY = dbToY(effectiveThresholdDb, rectHeight)
        const dist = Math.abs(y - threshY)
        if (dist < GRAB_ZONE_PX && dist < closestDist) {
          closestDist = dist
          closestLine = "threshold"
        }
      }
      if (noiseFloorDb != null) {
        const nfY = dbToY(noiseFloorDb, rectHeight)
        const dist = Math.abs(y - nfY)
        if (dist < GRAB_ZONE_PX && dist < closestDist) {
          closestLine = "noisefloor"
        }
      }
      return closestLine
    },
    [effectiveThresholdDb, noiseFloorDb]
  )

  const handleDragStart = useCallback(
    (clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return false
      const rect = canvas.getBoundingClientRect()
      const line = detectNearLine(clientY, rect.top, rect.height)
      if (line) {
        draggingRef.current = line
        return true
      }
      return false
    },
    [detectNearLine]
  )

  const handleDragMove = useCallback(
    (clientY: number) => {
      if (!draggingRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const y = clientY - rect.top
      const newDb = yToDb(y, rect.height)

      if (draggingRef.current === "threshold" && onThresholdDrag) {
        onThresholdDrag(Math.max(MIN_DB, Math.min(-5, Math.round(newDb))))
      } else if (draggingRef.current === "noisefloor" && onNoiseFloorDrag) {
        onNoiseFloorDrag(Math.max(MIN_DB, Math.min(-5, Math.round(newDb))))
      }
    },
    [onThresholdDrag, onNoiseFloorDrag]
  )

  const handleDragEnd = useCallback(() => {
    if (draggingRef.current === "noisefloor" && onNoiseFloorDragEnd) {
      onNoiseFloorDragEnd()
    }
    draggingRef.current = null
  }, [onNoiseFloorDragEnd])

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.strokeStyle = COLORS.GRID_LINE
      ctx.lineWidth = 1
      ctx.font = `${FONTS.SIZE_GRID} ${FONTS.MAIN}`
      ctx.fillStyle = COLORS.GRID_TEXT

      for (const freq of GRID_FREQUENCIES) {
        const x = freqToX(freq, width)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()

        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
        ctx.fillText(label, x + OFFSETS.GRID_LABEL_X, height - OFFSETS.GRID_LABEL_Y)
      }

      for (const db of GRID_DB_VALUES) {
        const y = dbToY(db, height)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        ctx.fillText(`${db} dB`, OFFSETS.DB_LABEL_X, y - OFFSETS.DB_LABEL_Y)
      }
    },
    []
  )

  const drawSpectrum = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      data: Float32Array,
      width: number,
      height: number,
      sr: number,
      fft: number,
      isPeak: boolean
    ) => {
      const binWidth = sr / fft
      ctx.beginPath()

      let started = false
      for (let i = 0; i < data.length; i++) {
        const freq = i * binWidth
        if (freq < AUDIO_CONSTANTS.MIN_FREQ || freq > AUDIO_CONSTANTS.MAX_FREQ) continue

        const x = freqToX(freq, width)
        const y = dbToY(data[i], height)

        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else {
          ctx.lineTo(x, y)
        }
      }

      if (isPeak) {
        ctx.strokeStyle = COLORS.SPECTRUM_PEAK
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        const lastX = freqToX(AUDIO_CONSTANTS.MAX_FREQ, width)
        ctx.lineTo(lastX, height)
        ctx.lineTo(freqToX(AUDIO_CONSTANTS.MIN_FREQ, width), height)
        ctx.closePath()

        const gradient = ctx.createLinearGradient(0, 0, 0, height)
        if (COLORS.GRADIENT) {
          for (const stop of COLORS.GRADIENT) {
            gradient.addColorStop(stop.stop, stop.color)
          }
        }
        ctx.fillStyle = gradient
        ctx.fill()

        ctx.beginPath()
        started = false
        for (let i = 0; i < data.length; i++) {
          const freq = i * binWidth
          if (freq < AUDIO_CONSTANTS.MIN_FREQ || freq > AUDIO_CONSTANTS.MAX_FREQ) continue
          const x = freqToX(freq, width)
          const y = dbToY(data[i], height)
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.strokeStyle = COLORS.SPECTRUM_MAIN
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    },
    []
  )

  const drawFeedbackMarkers = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      detections: FeedbackDetection[],
      width: number,
      height: number
    ) => {
      for (const detection of detections) {
        const x = freqToX(detection.frequency, width)
        const y = dbToY(detection.magnitude, height)

        const pulsePhase = ((Date.now() - detection.timestamp) % PULSE_INTERVAL_MS) / PULSE_INTERVAL_MS
        const pulseSize = PULSE_SIZE_BASE + Math.sin(pulsePhase * Math.PI * 2) * PULSE_SIZE_VARIATION

        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, pulseSize * GLOW_SCALE)
        glowGradient.addColorStop(0, COLORS.FEEDBACK_GLOW)
        glowGradient.addColorStop(0.5, COLORS.FEEDBACK_GLOW_HALF)
        glowGradient.addColorStop(1, COLORS.FEEDBACK_GLOW_ZERO)
        ctx.fillStyle = glowGradient
        ctx.fillRect(x - pulseSize * GLOW_SCALE, y - pulseSize * GLOW_SCALE, pulseSize * GLOW_SCALE * 2, pulseSize * GLOW_SCALE * 2)

        ctx.beginPath()
        ctx.arc(x, y, pulseSize, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.FEEDBACK_CORE
        ctx.fill()
        ctx.strokeStyle = COLORS.CROSSHAIR_TEXT_PRIMARY
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.font = `${FONTS.SIZE_MARKER_FREQ} ${FONTS.MAIN}`
        ctx.fillStyle = COLORS.FEEDBACK_CORE
        const freqLabel =
          detection.frequency >= 1000
            ? `${(detection.frequency / 1000).toFixed(2)}kHz`
            : `${Math.round(detection.frequency)}Hz`
        const labelWidth = ctx.measureText(freqLabel).width
        const labelX = Math.min(x - labelWidth / 2, width - labelWidth - OFFSETS.DB_LABEL_X)
        ctx.fillText(freqLabel, Math.max(OFFSETS.DB_LABEL_X, labelX), y - OFFSETS.MARKER_LABEL_Y)

        ctx.font = `${FONTS.SIZE_MARKER_DB} ${FONTS.MAIN}`
        ctx.fillStyle = COLORS.HISTORICAL_FILL
        ctx.fillText(`${detection.magnitude.toFixed(1)} dB`, Math.max(OFFSETS.DB_LABEL_X, labelX), y - OFFSETS.MARKER_DB_Y)
      }
    },
    []
  )

  const drawHistoricalMarkers = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      detections: HistoricalDetection[],
      _hTime: number,
      width: number,
      height: number
    ) => {
      for (const det of detections) {
        if (det.isActive) continue

        const x = freqToX(det.frequency, width)
        const y = dbToY(det.peakMagnitude, height)

        ctx.beginPath()
        ctx.arc(x, y, HISTORICAL_MARKER_SIZE, 0, Math.PI * 2)
        ctx.strokeStyle = COLORS.HISTORICAL_STROKE
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(x, y, HISTORICAL_MARKER_CORE_SIZE, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.HISTORICAL_FILL
        ctx.fill()

        ctx.font = `${FONTS.SIZE_HISTORICAL} ${FONTS.MAIN}`
        ctx.fillStyle = COLORS.HISTORICAL_STROKE
        const freqLabel =
          det.frequency >= 1000
            ? `${(det.frequency / 1000).toFixed(1)}k`
            : `${Math.round(det.frequency)}`
        const labelWidth = ctx.measureText(freqLabel).width
        const labelX = Math.min(x - labelWidth / 2, width - labelWidth - OFFSETS.DB_LABEL_X)
        ctx.fillText(freqLabel, Math.max(OFFSETS.DB_LABEL_X, labelX), y - OFFSETS.HISTORICAL_LABEL_Y)
      }
    },
    []
  )

  const drawCrosshair = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (hoveredFreqRef.current === null || hoveredDbRef.current === null) return

      const x = freqToX(hoveredFreqRef.current, width)
      const y = dbToY(hoveredDbRef.current, height)

      ctx.setLineDash(LINE_STYLES.CROSSHAIR)
      ctx.strokeStyle = COLORS.CROSSHAIR_LINE
      ctx.lineWidth = 1

      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()

      ctx.setLineDash([])

      ctx.font = `${FONTS.SIZE_CROSSHAIR_FREQ} ${FONTS.MAIN}`
      ctx.fillStyle = COLORS.CROSSHAIR_TEXT_PRIMARY
      const freq = hoveredFreqRef.current
      const freqLabel = freq >= 1000 ? `${(freq / 1000).toFixed(2)}kHz` : `${Math.round(freq)}Hz`
      ctx.fillText(freqLabel, x + OFFSETS.CROSSHAIR_LABEL_X, OFFSETS.CROSSHAIR_FREQ_Y)

      ctx.font = `${FONTS.SIZE_CROSSHAIR_DB} ${FONTS.MAIN}`
      ctx.fillStyle = COLORS.CROSSHAIR_TEXT_SECONDARY
      ctx.fillText(`${hoveredDbRef.current.toFixed(1)} dB`, x + OFFSETS.CROSSHAIR_LABEL_X, OFFSETS.CROSSHAIR_DB_Y)
    },
    []
  )

  const drawDiagnosticLines = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      nfDb: number | null,
      etDb: number | null
    ) => {
      ctx.save()
      ctx.setLineDash(LINE_STYLES.DIAGNOSTIC_PRIMARY)
      ctx.lineWidth = 1.5

      // Noise floor -- blue (draggable)
      if (nfDb != null && nfDb > MIN_DB && nfDb < MAX_DB) {
        const y = dbToY(nfDb, height)

        // Translucent grab zone
        ctx.fillStyle = COLORS.GRAB_ZONE_FLOOR
        ctx.fillRect(0, y - GRAB_ZONE_PX, width, GRAB_ZONE_PX * 2)

        // Dashed line
        ctx.strokeStyle = COLORS.FLOOR_LINE
        ctx.lineWidth = 2
        ctx.setLineDash(LINE_STYLES.DIAGNOSTIC_SECONDARY)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        ctx.setLineDash(LINE_STYLES.DIAGNOSTIC_PRIMARY)
        ctx.lineWidth = 1.5

        // Label pill
        ctx.font = `${FONTS.SIZE_DIAGNOSTIC} ${FONTS.MAIN}`
        const label = `FLOOR ${Math.round(nfDb)} dB`
        const lw = ctx.measureText(label).width
        const pillW = lw + OFFSETS.PILL_PADDING_X
        const pillX = OFFSETS.DIAGNOSTIC_LABEL_X
        const pillY = y - OFFSETS.DIAGNOSTIC_LABEL_Y

        ctx.fillStyle = COLORS.DIAGNOSTIC_LABEL_BG
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, OFFSETS.PILL_HEIGHT, OFFSETS.PILL_RADIUS)
        ctx.fill()
        ctx.strokeStyle = COLORS.DIAGNOSTIC_LABEL_BORDER_FLOOR
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = COLORS.DIAGNOSTIC_LABEL_TEXT_FLOOR
        ctx.fillText(label, pillX + OFFSETS.PILL_TEXT_X, y + OFFSETS.DIAGNOSTIC_TEXT_OFFSET_Y)

        // Drag arrows
        ctx.fillStyle = COLORS.DIAGNOSTIC_LABEL_TEXT_FLOOR
        ctx.font = `${FONTS.SIZE_DIAGNOSTIC} sans-serif`
        ctx.fillText("\u25B2", pillX + pillW + OFFSETS.ARROW_OFFSET_X, y - OFFSETS.DIAGNOSTIC_ARROW_UP_Y)
        ctx.fillText("\u25BC", pillX + pillW + OFFSETS.ARROW_OFFSET_X, y + OFFSETS.DIAGNOSTIC_ARROW_DOWN_Y)
      }

      // Effective threshold -- amber (draggable)
      if (etDb != null && etDb > MIN_DB && etDb < MAX_DB) {
        const y = dbToY(etDb, height)

        // Translucent grab zone
        ctx.fillStyle = COLORS.GRAB_ZONE_THRESHOLD
        ctx.fillRect(0, y - GRAB_ZONE_PX, width, GRAB_ZONE_PX * 2)

        // Dashed line
        ctx.strokeStyle = COLORS.THRESHOLD_LINE
        ctx.lineWidth = 2
        ctx.setLineDash(LINE_STYLES.DIAGNOSTIC_SECONDARY)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        ctx.setLineDash(LINE_STYLES.DIAGNOSTIC_PRIMARY)
        ctx.lineWidth = 1.5

        // Label pill
        ctx.font = `${FONTS.SIZE_DIAGNOSTIC} ${FONTS.MAIN}`
        const gap = nfDb != null ? Math.round(etDb - nfDb) : null
        const label = gap != null
          ? `THRESHOLD ${Math.round(etDb)} dB  (+${gap} dB)`
          : `THRESHOLD ${Math.round(etDb)} dB`
        const lw = ctx.measureText(label).width
        const pillW = lw + OFFSETS.PILL_PADDING_X
        const pillX = width - pillW - OFFSETS.DIAGNOSTIC_LABEL_X
        const pillY = y - OFFSETS.DIAGNOSTIC_LABEL_Y

        ctx.fillStyle = COLORS.DIAGNOSTIC_LABEL_BG
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, OFFSETS.PILL_HEIGHT, OFFSETS.PILL_RADIUS)
        ctx.fill()
        ctx.strokeStyle = COLORS.DIAGNOSTIC_LABEL_BORDER_THRESHOLD
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = COLORS.DIAGNOSTIC_LABEL_TEXT_THRESHOLD
        ctx.fillText(label, pillX + OFFSETS.PILL_TEXT_X, y + OFFSETS.DIAGNOSTIC_TEXT_OFFSET_Y)

        // Drag arrows
        ctx.fillStyle = COLORS.DIAGNOSTIC_LABEL_TEXT_THRESHOLD
        ctx.font = `${FONTS.SIZE_DIAGNOSTIC} sans-serif`
        ctx.fillText("\u25B2", width - OFFSETS.ARROW_END_OFFSET_X, y - OFFSETS.DIAGNOSTIC_ARROW_UP_Y)
        ctx.fillText("\u25BC", width - OFFSETS.ARROW_END_OFFSET_X, y + OFFSETS.DIAGNOSTIC_ARROW_DOWN_Y)
      }

      ctx.setLineDash([])
      ctx.restore()
    },
    []
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      setCanvasSize(rect.width + rect.height)
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio
    const width = canvas.width / dpr
    const height = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
    bgGradient.addColorStop(0, COLORS.CANVAS_BG_START)
    bgGradient.addColorStop(1, COLORS.CANVAS_BG_END)
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    drawGrid(ctx, width, height)

    if (frequencyData) {
      if (peakData && showPeakHold) {
        drawSpectrum(ctx, peakData, width, height, sampleRate, fftSize, true)
      }
      drawSpectrum(ctx, frequencyData, width, height, sampleRate, fftSize, false)
    }

    // Diagnostic lines (noise floor + effective threshold)
    drawDiagnosticLines(ctx, width, height, noiseFloorDb, effectiveThresholdDb)

    if (historicalDetections.length > 0) {
      drawHistoricalMarkers(ctx, historicalDetections, holdTime, width, height)
    }

    if (feedbackDetections.length > 0) {
      drawFeedbackMarkers(ctx, feedbackDetections, width, height)
    }

    drawCrosshair(ctx, width, height)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [
    frequencyData,
    peakData,
    feedbackDetections,
    historicalDetections,
    holdTime,
    sampleRate,
    fftSize,
    isFrozen,
    showPeakHold,
    noiseFloorDb,
    effectiveThresholdDb,
    crosshairTick,
    canvasSize,
    drawGrid,
    drawSpectrum,
    drawDiagnosticLines,
    drawFeedbackMarkers,
    drawHistoricalMarkers,
    drawCrosshair,
  ])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (handleDragStart(e.clientY)) e.preventDefault()
    },
    [handleDragStart]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (draggingRef.current) {
        handleDragMove(e.clientY)
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()

      // Change cursor near draggable lines
      const nearLine = detectNearLine(e.clientY, rect.top, rect.height)
      canvas.style.cursor = nearLine ? "ns-resize" : "crosshair"

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      hoveredFreqRef.current = xToFreq(x, rect.width)
      hoveredDbRef.current = yToDb(y, rect.height)

      if (isFrozen) {
        setCrosshairTick((t) => t + 1)
      }
    },
    [isFrozen, detectNearLine, handleDragMove]
  )

  const handleMouseUp = useCallback(() => {
    handleDragEnd()
  }, [handleDragEnd])

  const handleMouseLeave = useCallback(() => {
    handleDragEnd()
    hoveredFreqRef.current = null
    hoveredDbRef.current = null
  }, [handleDragEnd])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (!e.touches[0]) return
      if (handleDragStart(e.touches[0].clientY)) e.preventDefault()
    },
    [handleDragStart]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current || !e.touches[0]) return
      e.preventDefault()
      handleDragMove(e.touches[0].clientY)
    },
    [handleDragMove]
  )

  const handleTouchEnd = useCallback(() => {
    handleDragEnd()
  }, [handleDragEnd])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ minHeight: LAYOUT_CONSTANTS.CANVAS_MIN_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair rounded-lg touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {isFrozen && frequencyData && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-feedback-warning/15 border border-feedback-warning/40 rounded-md px-3 py-1.5 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-feedback-warning" />
          <span className="font-mono text-xs font-bold text-feedback-warning tracking-wider">PAUSED</span>
        </div>
      )}
      {!frequencyData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-muted-foreground text-sm font-mono">
            {"Click \"Start Engine\" to begin"}
          </div>
          <div className="text-muted-foreground/50 text-xs font-mono mt-2">
            Grant microphone access when prompted
          </div>
        </div>
      )}
    </div>
  )
}
