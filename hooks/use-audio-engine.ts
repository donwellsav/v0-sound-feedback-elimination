"use client"

import { useCallback, useRef, useState } from "react"

/**
 * Advisory-only filter recommendation.
 * No BiquadFilterNode -- this is data the engineer dials into their console.
 */
export interface FilterNode {
  id: string
  frequency: number
  gain: number
  q: number
}

export interface FeedbackDetection {
  frequency: number
  magnitude: number
  binIndex: number
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
}

const FFT_SIZE = 8192

/**
 * Quadratic (parabolic) interpolation for true peak frequency.
 * Refines a bin-center estimate to sub-bin accuracy (~1 Hz or better).
 */
function interpolatePeak(
  data: Float32Array,
  peakIndex: number,
  sampleRate: number,
  fftSize: number
): { frequency: number; amplitude: number } {
  const binWidth = sampleRate / fftSize

  if (peakIndex === 0 || peakIndex >= data.length - 1) {
    return { frequency: peakIndex * binWidth, amplitude: data[peakIndex] }
  }

  const alpha = data[peakIndex - 1]
  const beta = data[peakIndex]
  const gamma = data[peakIndex + 1]

  const denominator = alpha - 2 * beta + gamma
  let offset = 0
  if (denominator !== 0) {
    offset = (0.5 * (alpha - gamma)) / denominator
  }

  const exactBin = peakIndex + offset
  const trueFrequency = exactBin * binWidth
  const trueAmplitude = beta - 0.25 * (alpha - gamma) * offset

  return { frequency: trueFrequency, amplitude: trueAmplitude }
}

export function useAudioEngine() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number>(0)
  const dataArrayRef = useRef<Float32Array | null>(null)
  const timeDataRef = useRef<Float32Array | null>(null)
  const peakHoldRef = useRef<Float32Array | null>(null)
  const peakDecayRef = useRef<number>(0)
  const persistenceRef = useRef<Float32Array | null>(null)
  const historyRef = useRef<Float32Array[]>([])
  const lastUiPushRef = useRef<number>(0)
  const UI_THROTTLE_MS = 80 // ~12 fps for React state updates
  const HISTORY_LENGTH = 12

  const [state, setState] = useState<AudioEngineState>({
    isActive: false,
    isConnected: false,
    sampleRate: 44100,
    fftSize: FFT_SIZE,
  })

  const [frequencyData, setFrequencyData] = useState<Float32Array | null>(null)
  const [timeData, setTimeData] = useState<Float32Array | null>(null)
  const [peakData, setPeakData] = useState<Float32Array | null>(null)
  const [feedbackDetections, setFeedbackDetections] = useState<FeedbackDetection[]>([])
  const [rmsLevel, setRmsLevel] = useState<number>(-100)
  const [isFrozen, setIsFrozen] = useState(false)
  const isFrozenRef = useRef(false)

  // Advisory filter recommendations (data only, no audio processing)
  const [filters, setFilters] = useState<FilterNode[]>([])

  const detectFeedback = useCallback((data: Float32Array, sampleRate: number, fftSize: number) => {
    const detections: FeedbackDetection[] = []
    const binWidth = sampleRate / fftSize
    const persistence = persistenceRef.current

    const sorted = Array.from(data).filter((v) => v > -100).sort((a, b) => a - b)
    const medianLevel = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : -80
    const absoluteThreshold = Math.max(medianLevel + 6, -65)
    const prominenceThreshold = 8
    const persistenceRequired = 3

    for (let i = 3; i < data.length - 3; i++) {
      const freq = i * binWidth
      if (freq < 60 || freq > 16000) continue

      const val = data[i]
      if (val < absoluteThreshold) {
        if (persistence) persistence[i] = Math.max(0, persistence[i] - 1)
        continue
      }

      const isPeak =
        val >= data[i - 1] &&
        val >= data[i + 1] &&
        val >= data[i - 2] &&
        val >= data[i + 2] &&
        val >= data[i - 3] &&
        val >= data[i + 3]

      if (!isPeak) {
        if (persistence) persistence[i] = Math.max(0, persistence[i] - 1)
        continue
      }

      const windowHalf = Math.max(8, Math.min(40, Math.floor(i * 0.06)))
      const start = Math.max(0, i - windowHalf)
      const end = Math.min(data.length, i + windowHalf + 1)
      let sum = 0
      let count = 0
      for (let j = start; j < end; j++) {
        if (Math.abs(j - i) > 2) {
          sum += data[j]
          count++
        }
      }
      const localAverage = count > 0 ? sum / count : val
      const prominence = val - localAverage

      if (prominence < prominenceThreshold) {
        if (persistence) persistence[i] = Math.max(0, persistence[i] - 1)
        continue
      }

      if (persistence) {
        persistence[i] = Math.min(persistence[i] + 2, 30)
      }

      const persistenceScore = persistence ? persistence[i] : persistenceRequired
      if (persistenceScore >= persistenceRequired) {
        const peak = interpolatePeak(data, i, sampleRate, fftSize)
        detections.push({
          frequency: peak.frequency,
          magnitude: peak.amplitude,
          binIndex: i,
          timestamp: Date.now(),
        })
      }
    }

    // Merge nearby detections
    const merged: FeedbackDetection[] = []
    const used = new Set<number>()
    detections.sort((a, b) => b.magnitude - a.magnitude)

    for (const det of detections) {
      if (used.has(det.binIndex)) continue
      for (const other of detections) {
        if (other === det) continue
        const ratio = other.frequency / det.frequency
        if (ratio > 0.92 && ratio < 1.08) {
          used.add(other.binIndex)
        }
      }
      merged.push(det)
    }

    return merged.slice(0, 10)
  }, [])

  const updateAnalysis = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser || !dataArrayRef.current || !timeDataRef.current || !peakHoldRef.current) return

    analyser.getFloatFrequencyData(dataArrayRef.current)
    analyser.getFloatTimeDomainData(timeDataRef.current)

    for (let i = 0; i < dataArrayRef.current.length; i++) {
      if (dataArrayRef.current[i] > peakHoldRef.current[i]) {
        peakHoldRef.current[i] = dataArrayRef.current[i]
      } else {
        peakHoldRef.current[i] -= 0.3
      }
    }

    peakDecayRef.current++
    let latestDetections: FeedbackDetection[] | null = null
    if (peakDecayRef.current % 2 === 0) {
      historyRef.current.push(new Float32Array(dataArrayRef.current))
      if (historyRef.current.length > HISTORY_LENGTH) {
        historyRef.current.shift()
      }
      latestDetections = detectFeedback(
        dataArrayRef.current,
        audioContextRef.current?.sampleRate || 44100,
        analyser.fftSize
      )
    }

    // Throttle React state updates to ~12fps to prevent flash/flicker
    const now = performance.now()
    if (!isFrozenRef.current && now - lastUiPushRef.current >= UI_THROTTLE_MS) {
      lastUiPushRef.current = now

      let sumSquares = 0
      for (let i = 0; i < timeDataRef.current.length; i++) {
        sumSquares += timeDataRef.current[i] * timeDataRef.current[i]
      }
      const rms = Math.sqrt(sumSquares / timeDataRef.current.length)
      const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10))

      setRmsLevel(rmsDb)
      setFrequencyData(new Float32Array(dataArrayRef.current))
      setTimeData(new Float32Array(timeDataRef.current))
      setPeakData(new Float32Array(peakHoldRef.current))

      if (latestDetections) {
        setFeedbackDetections(latestDetections)
      }
    }

    animationFrameRef.current = requestAnimationFrame(updateAnalysis)
  }, [detectFeedback])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.5
      analyser.minDecibels = -100
      analyser.maxDecibels = -10

      const source = audioContext.createMediaStreamSource(stream)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source
      streamRef.current = stream

      // Pure analysis chain: source -> analyser (no filter nodes)
      source.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      dataArrayRef.current = new Float32Array(bufferLength)
      timeDataRef.current = new Float32Array(analyser.fftSize)
      peakHoldRef.current = new Float32Array(bufferLength).fill(-100)
      persistenceRef.current = new Float32Array(bufferLength).fill(0)
      historyRef.current = []

      setState({
        isActive: true,
        isConnected: true,
        sampleRate: audioContext.sampleRate,
        fftSize: FFT_SIZE,
      })

      animationFrameRef.current = requestAnimationFrame(updateAnalysis)
    } catch (err) {
      console.error("Failed to start audio:", err)
    }
  }, [updateAnalysis])

  const stop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    sourceRef.current?.disconnect()
    audioContextRef.current?.close()

    audioContextRef.current = null
    analyserRef.current = null
    sourceRef.current = null
    streamRef.current = null
    dataArrayRef.current = null
    timeDataRef.current = null
    peakHoldRef.current = null
    persistenceRef.current = null
    historyRef.current = []

    setState({
      isActive: false,
      isConnected: false,
      sampleRate: 44100,
      fftSize: FFT_SIZE,
    })

    setTimeData(null)
    setRmsLevel(-100)
    setIsFrozen(false)
    isFrozenRef.current = false
  }, [])

  // Advisory filter management (data only -- no audio processing)
  const addFilter = useCallback(
    (frequency: number, gain: number = -12, q: number = 30) => {
      const id = `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const newFilter: FilterNode = { id, frequency, gain, q }
      setFilters((prev) => [...prev, newFilter])
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

  return {
    state,
    frequencyData,
    timeData,
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
  }
}
