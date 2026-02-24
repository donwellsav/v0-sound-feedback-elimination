"use client"

import { useCallback, useEffect, useRef, useState } from "react"
// @ts-expect-error -- FeedbackDetector is a plain JS class, no typings
import FeedbackDetector from "@/lib/FeedbackDetector"

// ---------- Public Types ----------

export interface FeedbackDetection {
  frequency: number
  magnitude: number // levelDb from detector
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

/** Advisory filter recommendation (data only, no audio processing). */
export interface FilterNode {
  id: string
  frequency: number
  gain: number
  q: number
}

export interface AudioEngineState {
  isActive: boolean
  isConnected: boolean
  sampleRate: number
  fftSize: number
  noiseFloorDb: number | null
  effectiveThresholdDb: number
}

export interface DetectorSettings {
  fftSize: number
  thresholdDb: number
  sustainMs: number
  prominenceDb: number
  noiseFloorEnabled: boolean
}

const DEFAULT_FFT = 2048

// ---------- Hook ----------

export function useAudioEngine() {
  // Core: FeedbackDetector lives in a ref -- completely isolated from React renders
  const detectorRef = useRef<InstanceType<typeof FeedbackDetector> | null>(null)
  // Separate analyser ref for raw spectrum drawing (piggybacks on detector's AudioContext)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const drawBufferRef = useRef<Float32Array | null>(null)
  const peakHoldRef = useRef<Float32Array | null>(null)
  const rafIdRef = useRef<number>(0)
  const lastUiPushRef = useRef<number>(0)
  const UI_THROTTLE_MS = 60 // ~16 fps for spectrum canvas

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

  // Advisory filter recommendations
  const [filters, setFilters] = useState<FilterNode[]>([])

  // Live detections accumulator (written from detector callbacks, read from RAF)
  const liveHitsRef = useRef<Map<number, FeedbackDetection>>(new Map())

  // ---- Detector callbacks (stable, never re-created) ----
  const onFeedbackDetected = useCallback((payload: {
    binIndex: number
    frequencyHz: number
    levelDb: number
    prominenceDb: number
    sustainedMs: number
    fftSize: number
    sampleRate: number
    noiseFloorDb: number | null
    effectiveThresholdDb: number
    timestamp: number
  }) => {
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

  const onFeedbackCleared = useCallback((payload: { binIndex: number }) => {
    liveHitsRef.current.delete(payload.binIndex)
  }, [])

  // ---- Spectrum drawing loop (separate RAF, reads analyser directly) ----
  const drawLoop = useCallback(() => {
    const analyser = analyserRef.current
    const buf = drawBufferRef.current
    const peak = peakHoldRef.current
    if (!analyser || !buf || !peak) {
      rafIdRef.current = requestAnimationFrame(drawLoop)
      return
    }

    analyser.getFloatFrequencyData(buf)

    // Peak hold decay
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > peak[i]) {
        peak[i] = buf[i]
      } else {
        peak[i] -= 0.3
      }
    }

    // Throttle React state pushes for canvas
    const now = performance.now()
    if (!isFrozenRef.current && now - lastUiPushRef.current >= UI_THROTTLE_MS) {
      lastUiPushRef.current = now

      setFrequencyData(new Float32Array(buf))
      setPeakData(new Float32Array(peak))

      // Push accumulated live detections as a snapshot
      const hits = Array.from(liveHitsRef.current.values())
      setFeedbackDetections(hits)

      // Push detector telemetry
      const det = detectorRef.current
      if (det) {
        setState((prev) => {
          const nf = det.noiseFloorDb
          const et = det.effectiveThresholdDb
          if (prev.noiseFloorDb === nf && prev.effectiveThresholdDb === et) return prev
          return { ...prev, noiseFloorDb: nf, effectiveThresholdDb: et }
        })
      }

      // RMS from spectrum (approximate)
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

      // Create detector (or reconfigure existing)
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
      await detector.start(stream)

      // Piggyback a second AnalyserNode on the same AudioContext for raw spectrum drawing
      const ctx = detector._audioContext as AudioContext
      const source = detector._source as MediaStreamAudioSourceNode
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

      // Start spectrum draw RAF
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
      try { (analyserRef.current as AnalyserNode).disconnect() } catch (_) { /* ignore */ }
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

  // ---- Live setting updates (call setX on the ref, no re-render) ----

  const updateDetectorSettings = useCallback((s: Partial<DetectorSettings>) => {
    const det = detectorRef.current
    if (!det) return

    if (s.fftSize !== undefined) {
      det.setFftSize(s.fftSize)
      // Also resize the draw analyser
      if (analyserRef.current) {
        analyserRef.current.fftSize = s.fftSize
        const n = analyserRef.current.frequencyBinCount
        drawBufferRef.current = new Float32Array(n)
        peakHoldRef.current = new Float32Array(n).fill(-100)
      }
      setState((prev) => ({ ...prev, fftSize: s.fftSize! }))
    }
    if (s.thresholdDb !== undefined) det.setThresholdDb(s.thresholdDb)
    if (s.sustainMs !== undefined) det.setSustainMs(s.sustainMs)
    if (s.prominenceDb !== undefined) det.setProminenceDb(s.prominenceDb)
    if (s.noiseFloorEnabled !== undefined) det.setNoiseFloorEnabled(s.noiseFloorEnabled)
  }, [])

  // ---- Advisory filter management ----

  const addFilter = useCallback(
    (frequency: number, gain: number = -12, q: number = 30) => {
      const id = `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setFilters((prev) => [...prev, { id, frequency, gain, q }])
      return id
    },
    []
  )

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilters([])
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
    filters,
    rmsLevel,
    isFrozen,
    start,
    stop,
    addFilter,
    removeFilter,
    clearAllFilters,
    toggleFreeze,
    updateDetectorSettings,
  }
}
