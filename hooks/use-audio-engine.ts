"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FeedbackDetector } from "@/lib/FeedbackDetector"
import type { FeedbackDetectedEvent, FeedbackClearedEvent } from "@/lib/FeedbackDetector"
import { AUDIO_CONSTANTS } from "@/lib/constants"

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
  sustainMs: number
  prominenceDb: number
  thresholdMode: string
  noiseFloorDb: number | null
  effectiveThresholdDb: number
}

// ---------- Hook ----------

export function useAudioEngine() {
  // Core: FeedbackDetector lives in a ref -- completely isolated from React renders
  const detectorRef = useRef<FeedbackDetector | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const drawBufferRef = useRef<Float32Array | null>(null)
  const peakHoldRef = useRef<Float32Array | null>(null)
  const rafIdRef = useRef<number>(0)
  const stoppedRef = useRef<boolean>(true)
  const lastUiPushRef = useRef<number>(0)

  // UI Buffers for double-buffering to avoid allocation in render loop
  const uiBuffersRef = useRef<[Float32Array, Float32Array] | null>(null)
  const peakBuffersRef = useRef<[Float32Array, Float32Array] | null>(null)
  const bufferIndexRef = useRef<number>(0)

  // ---- React state (UI-facing) ----
  const [state, setState] = useState<AudioEngineState>({
    isActive: false,
    isConnected: false,
    sampleRate: AUDIO_CONSTANTS.DEFAULT_SAMPLE_RATE,
    fftSize: AUDIO_CONSTANTS.DEFAULT_FFT,
    sustainMs: AUDIO_CONSTANTS.DEFAULT_SUSTAIN_MS,
    prominenceDb: AUDIO_CONSTANTS.DEFAULT_PROMINENCE_DB,
    thresholdMode: "hybrid",
    noiseFloorDb: null,
    effectiveThresholdDb: AUDIO_CONSTANTS.DEFAULT_THRESHOLD_DB,
  })

  const [frequencyData, setFrequencyData] = useState<Float32Array | null>(null)
  const [peakData, setPeakData] = useState<Float32Array | null>(null)
  const [feedbackDetections, setFeedbackDetections] = useState<FeedbackDetection[]>([])
  const [rmsLevel, setRmsLevel] = useState<number>(-100)
  const [inputGainDb, setInputGainDb] = useState(0)
  const [isFrozen, setIsFrozen] = useState(false)
  const isFrozenRef = useRef(false)

  // Live detections accumulator (written from detector callbacks, read from RAF)
  const liveHitsRef = useRef<Map<number, FeedbackDetection>>(new Map())

  // ---- Detector callbacks (stable, never re-created) ----
  const onFeedbackDetected = useCallback((payload: FeedbackDetectedEvent) => {
    // Guard against null frequencyHz if sampleRate is unavailable
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
    if (stoppedRef.current) return

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
        peak[i] -= AUDIO_CONSTANTS.PEAK_HOLD_DECAY_DB
      }
    }

    const now = performance.now()
    if (!isFrozenRef.current && now - lastUiPushRef.current >= AUDIO_CONSTANTS.UI_THROTTLE_MS) {
      lastUiPushRef.current = now

      // Double buffering: Re-use buffers to avoid GC pressure from new Float32Array()
      if (!uiBuffersRef.current || uiBuffersRef.current[0].length !== buf.length) {
        uiBuffersRef.current = [new Float32Array(buf.length), new Float32Array(buf.length)]
      }
      if (!peakBuffersRef.current || peakBuffersRef.current[0].length !== peak.length) {
        peakBuffersRef.current = [new Float32Array(peak.length), new Float32Array(peak.length)]
      }

      bufferIndexRef.current = (bufferIndexRef.current + 1) % 2
      const idx = bufferIndexRef.current

      const nextFreq = uiBuffersRef.current[idx]
      nextFreq.set(buf)
      setFrequencyData(nextFreq)

      const nextPeak = peakBuffersRef.current[idx]
      nextPeak.set(peak)
      setPeakData(nextPeak)

      const hits = Array.from(liveHitsRef.current.values())
      setFeedbackDetections(hits)

      const det = detectorRef.current
      if (det) {
        const nf = det.noiseFloorDb
        const et = det.effectiveThresholdDb
        setState((prev) => {
          if (prev.noiseFloorDb === nf && prev.effectiveThresholdDb === et) return prev
          return { ...prev, noiseFloorDb: nf, effectiveThresholdDb: et }
        })
      }

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
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      if (!detectorRef.current) {
        detectorRef.current = new FeedbackDetector({
          fftSize: AUDIO_CONSTANTS.DEFAULT_FFT,
          thresholdMode: "hybrid",
          thresholdDb: AUDIO_CONSTANTS.DEFAULT_THRESHOLD_DB,
          relativeThresholdDb: AUDIO_CONSTANTS.DEFAULT_RELATIVE_THRESHOLD_DB,
          prominenceDb: AUDIO_CONSTANTS.DEFAULT_PROMINENCE_DB,
          neighborhoodBins: AUDIO_CONSTANTS.DEFAULT_NEIGHBORHOOD_BINS,
          sustainMs: AUDIO_CONSTANTS.DEFAULT_SUSTAIN_MS,
          clearMs: AUDIO_CONSTANTS.DEFAULT_CLEAR_MS,
          minFrequencyHz: AUDIO_CONSTANTS.DEFAULT_MIN_FREQ_HZ,
          maxFrequencyHz: AUDIO_CONSTANTS.DEFAULT_MAX_FREQ_HZ,
          noiseFloor: {
            enabled: true,
            sampleCount: AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_SAMPLE_COUNT,
            attackMs: AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_ATTACK_MS,
            releaseMs: AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_RELEASE_MS,
          },
          smoothingTimeConstant: 0,
          onFeedbackDetected,
          onFeedbackCleared,
        })
      }

      const detector = detectorRef.current
      await detector.start(stream)

      const ctx = detector._audioContext
      if (!ctx) {
        console.error("FeedbackDetector started but _audioContext is null")
        return
      }

      // Set initial input gain on the detector's internal GainNode
      detector.setInputGainDb(inputGainDb)

      // Create a separate draw analyser for the UI spectrum, fed from detector's GainNode
      const drawAnalyser = ctx.createAnalyser()
      drawAnalyser.fftSize = detector.fftSize
      drawAnalyser.smoothingTimeConstant = AUDIO_CONSTANTS.ANALYSIS_SMOOTHING
      drawAnalyser.minDecibels = AUDIO_CONSTANTS.MIN_DB
      drawAnalyser.maxDecibels = AUDIO_CONSTANTS.MAX_DB
      if (detector._gainNode) {
        detector._gainNode.connect(drawAnalyser)
      }

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
        sustainMs: detector._sustainMs,
        prominenceDb: detector._prominenceDb,
        thresholdMode: detector._thresholdMode,
        noiseFloorDb: null,
        effectiveThresholdDb: detector.effectiveThresholdDb,
      })

      stoppedRef.current = false
      rafIdRef.current = requestAnimationFrame(drawLoop)
    } catch (err) {
      // Clean up mic stream if it was acquired before the error
      if (stream) {
        for (const t of stream.getTracks()) t.stop()
      }
      console.error("Failed to start audio:", err)
    }
  }, [onFeedbackDetected, onFeedbackCleared, drawLoop])

  const stop = useCallback(() => {
    stoppedRef.current = true

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = 0
    }

    if (analyserRef.current) {
      try { analyserRef.current.disconnect() } catch (_) { /* ignore */ }
      analyserRef.current = null
    }

    if (detectorRef.current) {
      detectorRef.current.stop({ releaseMic: true })
      detectorRef.current = null
    }

    drawBufferRef.current = null
    peakHoldRef.current = null
    uiBuffersRef.current = null
    peakBuffersRef.current = null
    liveHitsRef.current.clear()

    setState({
      isActive: false,
      isConnected: false,
      sampleRate: AUDIO_CONSTANTS.DEFAULT_SAMPLE_RATE,
      fftSize: AUDIO_CONSTANTS.DEFAULT_FFT,
      sustainMs: AUDIO_CONSTANTS.DEFAULT_SUSTAIN_MS,
      prominenceDb: AUDIO_CONSTANTS.DEFAULT_PROMINENCE_DB,
      thresholdMode: "hybrid",
      noiseFloorDb: null,
      effectiveThresholdDb: AUDIO_CONSTANTS.DEFAULT_THRESHOLD_DB,
    })

    setFrequencyData(null)
    setPeakData(null)
    setFeedbackDetections([])
    setRmsLevel(AUDIO_CONSTANTS.MIN_DB)
    setIsFrozen(false)
    isFrozenRef.current = false
  }, [])

  const setInputGain = useCallback((db: number) => {
    const clamped = Math.max(AUDIO_CONSTANTS.GAIN_MIN_DB, Math.min(AUDIO_CONSTANTS.GAIN_MAX_DB, db))
    setInputGainDb(clamped)
    if (detectorRef.current) {
      detectorRef.current.setInputGainDb(clamped)
    }
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
    detectorRef,
    frequencyData,
    peakData,
    feedbackDetections,
    rmsLevel,
    inputGainDb,
    setInputGain,
    isFrozen,
    start,
    stop,
    toggleFreeze,
  }
}
