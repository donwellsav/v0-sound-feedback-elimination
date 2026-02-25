"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import type { FeedbackDetection, HistoricalDetection } from "@/hooks/use-audio-engine"
import { AUDIO_CONSTANTS, VISUAL_CONSTANTS } from "@/lib/constants"
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
const { COLORS, GRAB_ZONE_PX, PULSE_SIZE_BASE, PULSE_SIZE_VARIATION, GLOW_SCALE, HISTORICAL_MARKER_SIZE, HISTORICAL_MARKER_CORE_SIZE } = VISUAL_CONSTANTS

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
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)"
      ctx.lineWidth = 1
      ctx.font = "10px var(--font-jetbrains), monospace"
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)"

      for (const freq of GRID_FREQUENCIES) {
        const x = freqToX(freq, width)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()

        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
        ctx.fillText(label, x + 3, height - 4)
      }

      for (const db of GRID_DB_VALUES) {
        const y = dbToY(db, height)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        ctx.fillText(`${db} dB`, 4, y - 3)
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
        gradient.addColorStop(0, "rgba(255, 80, 50, 0.8)")
        gradient.addColorStop(0.3, "rgba(255, 160, 50, 0.5)")
        gradient.addColorStop(0.6, "rgba(0, 200, 120, 0.3)")
        gradient.addColorStop(1, "rgba(0, 200, 120, 0.05)")
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

        const pulsePhase = ((Date.now() - detection.timestamp) % 1000) / 1000
        const pulseSize = PULSE_SIZE_BASE + Math.sin(pulsePhase * Math.PI * 2) * PULSE_SIZE_VARIATION

        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, pulseSize * GLOW_SCALE)
        glowGradient.addColorStop(0, COLORS.FEEDBACK_GLOW)
        glowGradient.addColorStop(0.5, "rgba(255, 60, 40, 0.2)")
        glowGradient.addColorStop(1, "rgba(255, 60, 40, 0)")
        ctx.fillStyle = glowGradient
        ctx.fillRect(x - pulseSize * GLOW_SCALE, y - pulseSize * GLOW_SCALE, pulseSize * GLOW_SCALE * 2, pulseSize * GLOW_SCALE * 2)

        ctx.beginPath()
        ctx.arc(x, y, pulseSize, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.FEEDBACK_CORE
        ctx.fill()
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.font = "bold 11px var(--font-jetbrains), monospace"
        ctx.fillStyle = "rgba(255, 70, 50, 1)"
        const freqLabel =
          detection.frequency >= 1000
            ? `${(detection.frequency / 1000).toFixed(2)}kHz`
            : `${Math.round(detection.frequency)}Hz`
        const labelWidth = ctx.measureText(freqLabel).width
        const labelX = Math.min(x - labelWidth / 2, width - labelWidth - 4)
        ctx.fillText(freqLabel, Math.max(4, labelX), y - 14)

        ctx.font = "10px var(--font-jetbrains), monospace"
        ctx.fillStyle = "rgba(255, 160, 50, 0.9)"
        ctx.fillText(`${detection.magnitude.toFixed(1)} dB`, Math.max(4, labelX), y - 3)
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

        ctx.font = "9px var(--font-jetbrains), monospace"
        ctx.fillStyle = "rgba(255, 180, 50, 0.65)"
        const freqLabel =
          det.frequency >= 1000
            ? `${(det.frequency / 1000).toFixed(1)}k`
            : `${Math.round(det.frequency)}`
        const labelWidth = ctx.measureText(freqLabel).width
        const labelX = Math.min(x - labelWidth / 2, width - labelWidth - 4)
        ctx.fillText(freqLabel, Math.max(4, labelX), y - 10)
      }
    },
    []
  )

  const drawCrosshair = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (hoveredFreqRef.current === null || hoveredDbRef.current === null) return

      const x = freqToX(hoveredFreqRef.current, width)
      const y = dbToY(hoveredDbRef.current, height)

      ctx.setLineDash([4, 4])
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)"
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

      ctx.font = "bold 11px var(--font-jetbrains), monospace"
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)"
      const freq = hoveredFreqRef.current
      const freqLabel = freq >= 1000 ? `${(freq / 1000).toFixed(2)}kHz` : `${Math.round(freq)}Hz`
      ctx.fillText(freqLabel, x + 8, 16)

      ctx.font = "10px var(--font-jetbrains), monospace"
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
      ctx.fillText(`${hoveredDbRef.current.toFixed(1)} dB`, x + 8, 28)
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
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5

      // Noise floor -- blue (draggable)
      if (nfDb != null && nfDb > MIN_DB && nfDb < MAX_DB) {
        const y = dbToY(nfDb, height)

        // Translucent grab zone
        ctx.fillStyle = "rgba(80, 160, 255, 0.02)"
        ctx.fillRect(0, y - GRAB_ZONE_PX, width, GRAB_ZONE_PX * 2)

        // Dashed line
        ctx.strokeStyle = COLORS.FLOOR_LINE
        ctx.lineWidth = 2
        ctx.setLineDash([10, 5])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        ctx.setLineDash([6, 4])
        ctx.lineWidth = 1.5

        // Label pill
        ctx.font = "bold 10px var(--font-jetbrains), monospace"
        const label = `FLOOR ${Math.round(nfDb)} dB`
        const lw = ctx.measureText(label).width
        const pillW = lw + 28
        const pillX = 6
        const pillY = y - 11

        ctx.fillStyle = "rgba(10, 10, 10, 0.9)"
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, 22, 4)
        ctx.fill()
        ctx.strokeStyle = "rgba(80, 160, 255, 0.4)"
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = "rgba(80, 160, 255, 0.9)"
        ctx.fillText(label, pillX + 6, y + 4)

        // Drag arrows
        ctx.fillStyle = "rgba(80, 160, 255, 0.7)"
        ctx.font = "bold 10px sans-serif"
        ctx.fillText("\u25B2", pillX + pillW + 4, y - 6)
        ctx.fillText("\u25BC", pillX + pillW + 4, y + 13)
      }

      // Effective threshold -- amber (draggable)
      if (etDb != null && etDb > MIN_DB && etDb < MAX_DB) {
        const y = dbToY(etDb, height)

        // Translucent grab zone
        ctx.fillStyle = "rgba(255, 180, 50, 0.03)"
        ctx.fillRect(0, y - GRAB_ZONE_PX, width, GRAB_ZONE_PX * 2)

        // Dashed line
        ctx.strokeStyle = COLORS.THRESHOLD_LINE
        ctx.lineWidth = 2
        ctx.setLineDash([10, 5])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        ctx.setLineDash([6, 4])
        ctx.lineWidth = 1.5

        // Label pill
        ctx.font = "bold 10px var(--font-jetbrains), monospace"
        const gap = nfDb != null ? Math.round(etDb - nfDb) : null
        const label = gap != null
          ? `THRESHOLD ${Math.round(etDb)} dB  (+${gap} dB)`
          : `THRESHOLD ${Math.round(etDb)} dB`
        const lw = ctx.measureText(label).width
        const pillW = lw + 28
        const pillX = width - pillW - 6
        const pillY = y - 11

        ctx.fillStyle = "rgba(10, 10, 10, 0.9)"
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, 22, 4)
        ctx.fill()
        ctx.strokeStyle = "rgba(255, 180, 50, 0.4)"
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = "rgba(255, 180, 50, 0.9)"
        ctx.fillText(label, pillX + 6, y + 4)

        // Drag arrows
        ctx.fillStyle = "rgba(255, 180, 50, 0.7)"
        ctx.font = "bold 10px sans-serif"
        ctx.fillText("\u25B2", width - 18, y - 6)
        ctx.fillText("\u25BC", width - 18, y + 13)
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
    bgGradient.addColorStop(0, "rgba(10, 10, 20, 0.95)")
    bgGradient.addColorStop(1, "rgba(5, 5, 15, 0.98)")
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
    <div ref={containerRef} className="relative w-full h-full min-h-[200px]">
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
