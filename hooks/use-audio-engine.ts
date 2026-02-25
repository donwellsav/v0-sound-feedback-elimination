"use client"

import { useCallback, useEffect, useRef, useState } from "react"
// @ts-expect-error -- FeedbackDetector is a plain JS class, no typings
import FeedbackDetector from "@/lib/FeedbackDetector"

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
const UI_POLL_MS = 60

// ---------- Hook ----------

export function useAudioEngine() {
  const detectorRef = useRef<InstanceType<typeof FeedbackDetector> | null>(null)
  const pollRef = useRef<number>(0)

  // React state (UI-facing)
  const [state, setState] = useState<AudioEngineState>({
    isActive: false,
    isConnected: false,
    sampleRate: 48000,
    fftSize: DEFAULT_FFT,
    noiseFloorDb: null,
    effectiveThresholdDb: -35,
  })

  const [feedbackDetections, setFeedbackDetections] = useState<FeedbackDetection[]>([])
  const [rmsLevel, setRmsLevel] = useState<number>(-100)
  const [isFrozen, setIsFrozen] = useState(false)
  const isFrozenRef = useRef(false)

  // Live detections accumulator (written from detector callbacks, read from poll)
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

  // ---- UI polling loop (pushes detections + engine telemetry to React) ----
  const pollLoop = useCallback(() => {
    if (isFrozenRef.current) {
      pollRef.current = requestAnimationFrame(pollLoop)
      return
    }

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

      // RMS approximation: max bin level from detector's frequency buffer
      const freqDb = det._freqDb as Float32Array | null
      if (freqDb) {
        let maxDb = -100
        for (let i = 0; i < freqDb.length; i++) {
          if (freqDb[i] > maxDb) maxDb = freqDb[i]
        }
        setRmsLevel(maxDb)
      }
    }

    // Throttle to ~60fps
    setTimeout(() => {
      pollRef.current = requestAnimationFrame(pollLoop)
    }, UI_POLL_MS)
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
      await detector.start(stream)

      const ctx = detector._audioContext as AudioContext
      liveHitsRef.current.clear()

      setState({
        isActive: true,
        isConnected: true,
        sampleRate: ctx.sampleRate,
        fftSize: detector.fftSize,
        noiseFloorDb: null,
        effectiveThresholdDb: detector.effectiveThresholdDb,
      })

      pollRef.current = requestAnimationFrame(pollLoop)
    } catch (err) {
      console.error("Failed to start audio:", err)
    }
  }, [onFeedbackDetected, onFeedbackCleared, pollLoop])

  const stop = useCallback(() => {
    if (pollRef.current) {
      cancelAnimationFrame(pollRef.current)
      pollRef.current = 0
    }

    if (detectorRef.current) {
      detectorRef.current.stop({ releaseMic: true })
    }

    liveHitsRef.current.clear()

    setState({
      isActive: false,
      isConnected: false,
      sampleRate: 48000,
      fftSize: DEFAULT_FFT,
      noiseFloorDb: null,
      effectiveThresholdDb: -35,
    })

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
      if (pollRef.current) cancelAnimationFrame(pollRef.current)
      if (detectorRef.current) detectorRef.current.stop({ releaseMic: true })
    }
  }, [])

  return {
    state,
    detectorRef,
    feedbackDetections,
    rmsLevel,
    isFrozen,
    start,
    stop,
    toggleFreeze,
  }
}
