"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import FeedbackDetector from "@/lib/FeedbackDetector"
import type { FeedbackClearedEvent, FeedbackDetectedEvent } from "@/lib/FeedbackDetector"

// ---------- Public Types ----------

export interface FeedbackDetection {
  frequency: number
  magnitude: number
  binIndex: number
  prominenceDb: number
  sustainedMs: number
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  timestamp: number
}

export interface HistoricalDetection extends FeedbackDetection {
  id: string
  firstSeen: number
  lastSeen: number
  hitCount: number
  peakMagnitude: number
  isActive: boolean
}

export interface AudioEngineState {
  isActive: boolean
  isConnected: boolean
  sampleRate: number
  fftSize: number
  noiseFloorDb: number | null
  effectiveThresholdDb: number
}

const DEFAULT_FFT = 2048

// ---------- Hook ----------

export function useAudioEngine() {
  // Core: FeedbackDetector lives in a ref -- completely isolated from React renders
  const detectorRef = useRef<FeedbackDetector | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const drawBufferRef = useRef<Float32Array | null>(null)
  const peakHoldRef = useRef<Float32Array | null>(null)
  const rafIdRef = useRef<number>(0)
  const lastUiPushRef = useRef<number>(0)
  const UI_THROTTLE_MS = 60

  // ---- React state (UI-facing) ----
  const [state, setState] = useState<AudioEngineState>({
    isActive: false,
    isConnected: false,
    sampleRate: 48000,
    fftSize: DEFAULT_FFT,
    noiseFloorDb: null,
    effectiveThresholdDb: -35,
  })

  const [frequencyData, setFrequencyData] = useState<Float32Array | null>(null)
  const [peakData, setPeakData] = useState<Float32Array | null>(null)
  const [feedbackDetections, setFeedbackDetections] = useState<FeedbackDetection[]>([])
  const [rmsLevel, setRmsLevel] = useState<number>(-100)
  const [isFrozen, setIsFrozen] = useState(false)
  const isFrozenRef = useRef(false)

  // Live detections accumulator (written from detector callbacks, read from RAF)
  const liveHitsRef = useRef<Map<number, FeedbackDetection>>(new Map())

  // ---- Detector callbacks (stable, never re-created) ----
  const onFeedbackDetected = useCallback((payload: FeedbackDetectedEvent) => {
    // The detector can return null for frequencyHz if sampleRate is unavailable.
    if (payload.frequencyHz == null) return

    liveHitsRef.current.set(payload.binIndex, {
      frequency: payload.frequencyHz,
      magnitude: payload.levelDb,
      binIndex: payload.binIndex,
      prominenceDb: payload.prominenceDb,
      sustainedMs: payload.sustainedMs,
      noiseFloorDb: payload.noiseFloorDb,
      effectiveThresholdDb: payload.effectiveThresholdDb,
      timestamp: payload.timestamp,
    })
  }, [])

  const onFeedbackCleared = useCallback((payload: FeedbackClearedEvent) => {
    liveHitsRef.current.delete(payload.binIndex)
  }, [])

  // ---- Spectrum drawing loop ----
  const drawLoop = useCallback(() => {
    const analyser = analyserRef.current
    const buf = drawBufferRef.current
    const peak = peakHoldRef.current
    if (!analyser || !buf || !peak) {
      rafIdRef.current = requestAnimationFrame(drawLoop)
      return
    }

    analyser.getFloatFrequencyData(buf)

    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > peak[i]) {
        peak[i] = buf[i]
      } else {
        peak[i] -= 0.3
      }
    }

    const now = performance.now()
    if (!isFrozenRef.current && now - lastUiPushRef.current >= UI_THROTTLE_MS) {
      lastUiPushRef.current = now

      setFrequencyData(new Float32Array(buf))
      setPeakData(new Float32Array(peak))

      const hits = Array.from(liveHitsRef.current.values())
      setFeedbackDetections(hits)

      const det = detectorRef.current
      if (det) {
        setState((prev) => {
          const nf = det.noiseFloorDb
          const et = det.effectiveThresholdDb
          if (prev.noiseFloorDb === nf && prev.effectiveThresholdDb === et) return prev
          return { ...prev, noiseFloorDb: nf, effectiveThresholdDb: et }
        })
      }

      // NOTE: this is a max-bin level, not true RMS. Keeping the existing field name for now.
      let maxDb = -100
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] > maxDb) maxDb = buf[i]
      }
      setRmsLevel(maxDb)
    }

    rafIdRef.current = requestAnimationFrame(drawLoop)
  }, [])

  // ---- Start / Stop ----

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      if (!detectorRef.current) {
        detectorRef.current = new FeedbackDetector({
          fftSize: DEFAULT_FFT,
          thresholdMode: "hybrid",
          thresholdDb: -35,
          relativeThresholdDb: 20,
          prominenceDb: 15,
          neighborhoodBins: 6,
          sustainMs: 400,
          clearMs: 200,
          minFrequencyHz: 80,
          maxFrequencyHz: 12000,
          noiseFloor: { enabled: true, sampleCount: 192, attackMs: 250, releaseMs: 1200 },
          smoothingTimeConstant: 0,
          onFeedbackDetected,
          onFeedbackCleared,
        })
      }

      const detector = detectorRef.current
      if (!detector) {
        throw new Error("FeedbackDetector failed to initialize.")
      }

      await detector.start(stream)

      const ctx = detector._audioContext
      const source = detector._source
      if (!ctx || !source) {
        throw new Error("FeedbackDetector did not initialize AudioContext/source node.")
      }

      const drawAnalyser = ctx.createAnalyser()
      drawAnalyser.fftSize = detector.fftSize
      drawAnalyser.smoothingTimeConstant = 0.5
      drawAnalyser.minDecibels = -100
      drawAnalyser.maxDecibels = -10
      source.connect(drawAnalyser)

      analyserRef.current = drawAnalyser
      const n = drawAnalyser.frequencyBinCount
      drawBufferRef.current = new Float32Array(n)
      peakHoldRef.current = new Float32Array(n).fill(-100)
      liveHitsRef.current.clear()

      setState({
        isActive: true,
        isConnected: true,
        sampleRate: ctx.sampleRate,
        fftSize: detector.fftSize,
        noiseFloorDb: null,
        effectiveThresholdDb: detector.effectiveThresholdDb,
      })

      rafIdRef.current = requestAnimationFrame(drawLoop)
    } catch (err) {
      console.error("Failed to start audio:", err)
    }
  }, [onFeedbackDetected, onFeedbackCleared, drawLoop])

  const stop = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = 0
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect()
      } catch (_) {
        /* ignore */
      }
      analyserRef.current = null
    }

    if (detectorRef.current) {
      detectorRef.current.stop({ releaseMic: true })
    }

    drawBufferRef.current = null
    peakHoldRef.current = null
    liveHitsRef.current.clear()

    setState({
      isActive: false,
      isConnected: false,
      sampleRate: 48000,
      fftSize: DEFAULT_FFT,
      noiseFloorDb: null,
      effectiveThresholdDb: -35,
    })

    setFrequencyData(null)
    setPeakData(null)
    setFeedbackDetections([])
    setRmsLevel(-100)
    setIsFrozen(false)
    isFrozenRef.current = false
  }, [])

  const toggleFreeze = useCallback(() => {
    setIsFrozen((prev) => {
      const next = !prev
      isFrozenRef.current = next
      return next
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      if (detectorRef.current) detectorRef.current.stop({ releaseMic: true })
    }
  }, [])

  return {
    state,
    frequencyData,
    peakData,
    feedbackDetections,
    rmsLevel,
    isFrozen,
    start,
    stop,
    toggleFreeze,
  }
}
