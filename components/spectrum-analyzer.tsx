"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import type { FeedbackDetection, HistoricalDetection } from "@/hooks/use-audio-engine"

interface SpectrumAnalyzerProps {
  frequencyData: Float32Array | null
  peakData: Float32Array | null
  feedbackDetections: FeedbackDetection[]
  historicalDetections?: HistoricalDetection[]
  holdTime?: number
  sampleRate: number
  fftSize: number
  isFrozen?: boolean
  onFrequencyClick?: (frequency: number) => void
}

function freqToX(freq: number, width: number): number {
  const minLog = Math.log10(20)
  const maxLog = Math.log10(20000)
  const log = Math.log10(Math.max(freq, 20))
  return ((log - minLog) / (maxLog - minLog)) * width
}

function xToFreq(x: number, width: number): number {
  const minLog = Math.log10(20)
  const maxLog = Math.log10(20000)
  const log = minLog + (x / width) * (maxLog - minLog)
  return Math.pow(10, log)
}

function dbToY(db: number, height: number, minDb: number, maxDb: number): number {
  return height - ((db - minDb) / (maxDb - minDb)) * height
}

const GRID_FREQUENCIES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
const GRID_DB_VALUES = [-80, -60, -40, -20, 0]
const MIN_DB = -100
const MAX_DB = -10

export function SpectrumAnalyzer({
  frequencyData,
  peakData,
  feedbackDetections,
  historicalDetections = [],
  holdTime = 10,
  sampleRate,
  fftSize,
  isFrozen = false,
  onFrequencyClick,
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoveredFreqRef = useRef<number | null>(null)
  const hoveredDbRef = useRef<number | null>(null)
  const [crosshairTick, setCrosshairTick] = useState(0)

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)"
      ctx.lineWidth = 1
      ctx.font = "10px var(--font-jetbrains), monospace"
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)"

      // Frequency grid lines
      for (const freq of GRID_FREQUENCIES) {
        const x = freqToX(freq, width)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()

        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
        ctx.fillText(label, x + 3, height - 4)
      }

      // dB grid lines
      for (const db of GRID_DB_VALUES) {
        const y = dbToY(db, height, MIN_DB, MAX_DB)
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
        if (freq < 20 || freq > 20000) continue

        const x = freqToX(freq, width)
        const y = dbToY(data[i], height, MIN_DB, MAX_DB)

        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else {
          ctx.lineTo(x, y)
        }
      }

      if (isPeak) {
        ctx.strokeStyle = "rgba(0, 200, 120, 0.3)"
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        // Fill with gradient
        const lastX = freqToX(20000, width)
        ctx.lineTo(lastX, height)
        ctx.lineTo(freqToX(20, width), height)
        ctx.closePath()

        const gradient = ctx.createLinearGradient(0, 0, 0, height)
        gradient.addColorStop(0, "rgba(255, 80, 50, 0.8)")
        gradient.addColorStop(0.3, "rgba(255, 160, 50, 0.5)")
        gradient.addColorStop(0.6, "rgba(0, 200, 120, 0.3)")
        gradient.addColorStop(1, "rgba(0, 200, 120, 0.05)")
        ctx.fillStyle = gradient
        ctx.fill()

        // Stroke the line
        ctx.beginPath()
        started = false
        for (let i = 0; i < data.length; i++) {
          const freq = i * binWidth
          if (freq < 20 || freq > 20000) continue
          const x = freqToX(freq, width)
          const y = dbToY(data[i], height, MIN_DB, MAX_DB)
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.strokeStyle = "rgba(0, 220, 130, 0.9)"
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
        const y = dbToY(detection.magnitude, height, MIN_DB, MAX_DB)

        // Pulsing glow circle
        const pulsePhase = ((Date.now() - detection.timestamp) % 1000) / 1000
        const pulseSize = 6 + Math.sin(pulsePhase * Math.PI * 2) * 3

        // Outer glow
        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, pulseSize * 3)
        glowGradient.addColorStop(0, "rgba(255, 60, 40, 0.6)")
        glowGradient.addColorStop(0.5, "rgba(255, 60, 40, 0.2)")
        glowGradient.addColorStop(1, "rgba(255, 60, 40, 0)")
        ctx.fillStyle = glowGradient
        ctx.fillRect(x - pulseSize * 3, y - pulseSize * 3, pulseSize * 6, pulseSize * 6)

        // Marker dot
        ctx.beginPath()
        ctx.arc(x, y, pulseSize, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(255, 70, 50, 0.9)"
        ctx.fill()
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Frequency label
        ctx.font = "bold 11px var(--font-jetbrains), monospace"
        ctx.fillStyle = "rgba(255, 70, 50, 1)"
        const freqLabel =
          detection.frequency >= 1000
            ? `${(detection.frequency / 1000).toFixed(2)}kHz`
            : `${Math.round(detection.frequency)}Hz`
        const labelWidth = ctx.measureText(freqLabel).width
        const labelX = Math.min(x - labelWidth / 2, width - labelWidth - 4)
        ctx.fillText(freqLabel, Math.max(4, labelX), y - 14)

        // dB label
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
      hTime: number,
      width: number,
      height: number
    ) => {
      const now = Date.now()
      for (const det of detections) {
        // Skip active ones -- they're drawn by drawFeedbackMarkers
        if (det.isActive) continue

        const elapsed = (now - det.lastSeen) / 1000
        // Fade out: full opacity at 0s, zero at holdTime
        const fadeRatio = Math.max(0, 1 - elapsed / hTime)
        if (fadeRatio <= 0) continue

        const x = freqToX(det.frequency, width)
        const y = dbToY(det.peakMagnitude, height, MIN_DB, MAX_DB)
        const alpha = fadeRatio * 0.6

        // Dimmer glow ring
        ctx.beginPath()
        ctx.arc(x, y, 8, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 180, 50, ${alpha * 0.5})`
        ctx.lineWidth = 1
        ctx.stroke()

        // Small dot
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 180, 50, ${alpha})`
        ctx.fill()

        // Frequency label
        ctx.font = "9px var(--font-jetbrains), monospace"
        ctx.fillStyle = `rgba(255, 180, 50, ${alpha * 0.8})`
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
      const y = dbToY(hoveredDbRef.current, height, MIN_DB, MAX_DB)

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

      // Label
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
    ctx.scale(dpr, dpr)

    const width = canvas.width / dpr
    const height = canvas.height / dpr

    // Always do a full redraw from current props.
    // When frozen, the audio engine stops updating frequencyData/peakData/feedbackDetections,
    // so the canvas naturally displays the frozen state.

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
    bgGradient.addColorStop(0, "rgba(10, 10, 20, 0.95)")
    bgGradient.addColorStop(1, "rgba(5, 5, 15, 0.98)")
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    // Grid
    drawGrid(ctx, width, height)

    // Spectrum data
    if (frequencyData) {
      if (peakData) {
        drawSpectrum(ctx, peakData, width, height, sampleRate, fftSize, true)
      }
      drawSpectrum(ctx, frequencyData, width, height, sampleRate, fftSize, false)
    }

    // Historical (stale) markers -- drawn first so active markers render on top
    if (historicalDetections.length > 0) {
      drawHistoricalMarkers(ctx, historicalDetections, holdTime, width, height)
    }

    // Active feedback markers
    if (feedbackDetections.length > 0) {
      drawFeedbackMarkers(ctx, feedbackDetections, width, height)
    }

    // Crosshair
    drawCrosshair(ctx, width, height)

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [
    frequencyData,
    peakData,
    feedbackDetections,
    historicalDetections,
    holdTime,
    sampleRate,
    fftSize,
    crosshairTick,
    drawGrid,
    drawSpectrum,
    drawFeedbackMarkers,
    drawHistoricalMarkers,
    drawCrosshair,
  ])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const width = rect.width
      const height = rect.height

      hoveredFreqRef.current = xToFreq(x, width)
      hoveredDbRef.current = MIN_DB + ((height - y) / height) * (MAX_DB - MIN_DB)

      // When frozen, nudge a tick so the effect re-runs to repaint crosshair
      if (isFrozen) {
        setCrosshairTick((t) => t + 1)
      }
    },
    [isFrozen]
  )

  const handleMouseLeave = useCallback(() => {
    hoveredFreqRef.current = null
    hoveredDbRef.current = null
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || !onFrequencyClick) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const freq = xToFreq(x, rect.width)
      onFrequencyClick(freq)
    },
    [onFrequencyClick]
  )

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair rounded-lg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
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
            {"Click \"Start Analysis\" to begin"}
          </div>
          <div className="text-muted-foreground/50 text-xs font-mono mt-2">
            Grant microphone access when prompted
          </div>
        </div>
      )}
    </div>
  )
}
