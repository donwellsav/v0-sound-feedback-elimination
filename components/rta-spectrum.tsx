"use client"

import { useRef, useEffect, useCallback } from "react"

interface RTASpectrumProps {
  detectorRef: React.RefObject<unknown>
  isRunning: boolean
}

export default function RTASpectrum({ detectorRef, isRunning }: RTASpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  // Resize canvas to match container (handles rotation, resize)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
  }, [])

  // Observe container size changes (rotation, layout shifts)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => resizeCanvas())
    observer.observe(container)
    resizeCanvas()

    return () => observer.disconnect()
  }, [resizeCanvas])

  // Main draw loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const width = canvas.width / dpr
      const height = canvas.height / dpr

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, width, height)

      // Grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)"
      ctx.lineWidth = 1

      // Horizontal dB grid
      const dbLines = [-80, -60, -40, -20, 0]
      const minDb = -100
      const maxDb = -10
      const dbRange = maxDb - minDb

      ctx.font = "10px var(--font-jetbrains), monospace"
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)"

      for (const db of dbLines) {
        const y = height - ((db - minDb) / dbRange) * height
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
        ctx.fillText(`${db}`, 4, y - 3)
      }

      // Vertical frequency grid (log scale)
      const freqLines = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
      const minLog = Math.log10(20)
      const maxLog = Math.log10(20000)
      const logRange = maxLog - minLog

      for (const freq of freqLines) {
        const x = ((Math.log10(freq) - minLog) / logRange) * width
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()

        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
        ctx.fillText(label, x + 3, height - 4)
      }

      // Draw spectrum if engine is running
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const det = detectorRef.current as any
      if (isRunning && det && det._analyser) {
        const freqData = det._freqDb as Float32Array
        const detMinDb = det._minDecibels as number
        const detMaxDb = det._maxDecibels as number
        const sampleRate = (det.sampleRate as number) || 48000
        const fftSize = det.fftSize as number

        if (freqData) {
          // Read fresh data from the analyser
          det._analyser.getFloatFrequencyData(freqData)

          const scaleLog = width / logRange
          const detDbRange = detMaxDb - detMinDb

          ctx.beginPath()
          ctx.strokeStyle = "#00ff00"
          ctx.lineWidth = 2
          ctx.lineJoin = "round"

          let started = false

          for (let i = 1; i < freqData.length; i++) {
            const hz = (i * sampleRate) / fftSize
            if (hz < 20) continue
            if (hz > 20000) break

            const x = (Math.log10(hz) - minLog) * scaleLog

            let db = freqData[i]
            if (db < detMinDb) db = detMinDb
            if (db > detMaxDb) db = detMaxDb

            const dbPercent = (db - detMinDb) / detDbRange
            const y = height - dbPercent * height

            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else {
              ctx.lineTo(x, y)
            }
          }
          ctx.stroke()
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [detectorRef, isRunning])

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[200px]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full rounded-lg touch-none"
        style={{ display: "block" }}
      />
      {!isRunning && (
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
