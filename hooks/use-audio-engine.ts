"use client"

import { useCallback, useRef, useState } from "react"

export interface FilterNode {
  id: string
  frequency: number
  gain: number
  q: number
  type: BiquadFilterType
  enabled: boolean
  node: BiquadFilterNode | null
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

export function useAudioEngine() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const filterNodesRef = useRef<Map<string, BiquadFilterNode>>(new Map())
  const animationFrameRef = useRef<number>(0)
  const dataArrayRef = useRef<Float32Array | null>(null)
  const timeDataRef = useRef<Float32Array | null>(null)
  const peakHoldRef = useRef<Float32Array | null>(null)
  const peakDecayRef = useRef<number>(0)
  // Persistence tracking: accumulate how many consecutive frames each bin is a candidate
  const persistenceRef = useRef<Float32Array | null>(null)
  const historyRef = useRef<Float32Array[]>([])
  const HISTORY_LENGTH = 12 // number of frames to keep for averaging

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
  const [filters, setFilters] = useState<FilterNode[]>([])
  const [rmsLevel, setRmsLevel] = useState<number>(-100)
  const [isFrozen, setIsFrozen] = useState(false)
  const frozenDataRef = useRef<{
    frequencyData: Float32Array | null
    peakData: Float32Array | null
    feedbackDetections: FeedbackDetection[]
    rmsLevel: number
  } | null>(null)

  const detectFeedback = useCallback((data: Float32Array, sampleRate: number) => {
    const detections: FeedbackDetection[] = []
    const binWidth = sampleRate / FFT_SIZE
    const persistence = persistenceRef.current

    // Dynamic threshold: compute overall median of the spectrum to adapt to noise floor
    const sorted = Array.from(data).filter((v) => v > -100).sort((a, b) => a - b)
    const medianLevel = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : -80

    // A bin must be above the noise floor by at least this many dB to be considered
    const absoluteThreshold = Math.max(medianLevel + 6, -65)

    // Prominence: how much a peak stands above its local neighborhood
    const prominenceThreshold = 8 // dB above local average
    // Persistence requirement: bin must be a candidate for N consecutive frames
    const persistenceRequired = 3

    for (let i = 3; i < data.length - 3; i++) {
      const freq = i * binWidth
      if (freq < 60 || freq > 16000) continue

      const val = data[i]
      if (val < absoluteThreshold) {
        // Decay persistence for bins that aren't candidates
        if (persistence) persistence[i] = Math.max(0, persistence[i] - 1)
        continue
      }

      // Check if this is a local peak (must be higher than 3 neighbors on each side)
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

      // Compute local average in a fixed-width neighborhood (skip +-2 bins around the peak)
      // Use proportional window: narrower at low freqs (where bins are closer), wider at high freqs
      const windowHalf = Math.max(8, Math.min(40, Math.floor(i * 0.06)))
      const start = Math.max(0, i - windowHalf)
      const end = Math.min(data.length, i + windowHalf + 1)
      let sum = 0
      let count = 0
      for (let j = start; j < end; j++) {
        // Exclude the peak region (+-2 bins)
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

      // Increment persistence counter
      if (persistence) {
        persistence[i] = Math.min(persistence[i] + 2, 30) // ramp up faster than decay
      }

      // Only flag as feedback if persistent across multiple frames
      const persistenceScore = persistence ? persistence[i] : persistenceRequired
      if (persistenceScore >= persistenceRequired) {
        detections.push({
          frequency: freq,
          magnitude: val,
          binIndex: i,
          timestamp: Date.now(),
        })
      }
    }

    // Merge nearby detections (within ~1/6 octave)
    const merged: FeedbackDetection[] = []
    const used = new Set<number>()
    detections.sort((a, b) => b.magnitude - a.magnitude)

    for (const det of detections) {
      if (used.has(det.binIndex)) continue
      // Mark nearby bins as used
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

    // Always read fresh data from the analyser (keeps Web Audio processing)
    analyser.getFloatFrequencyData(dataArrayRef.current)
    analyser.getFloatTimeDomainData(timeDataRef.current)

    // Update peak hold regardless of freeze (so peaks are current when we unfreeze)
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      if (dataArrayRef.current[i] > peakHoldRef.current[i]) {
        peakHoldRef.current[i] = dataArrayRef.current[i]
      } else {
        peakHoldRef.current[i] -= 0.3
      }
    }

    // Run detection logic regardless (persistence tracking stays accurate)
    peakDecayRef.current++
    let latestDetections: FeedbackDetection[] | null = null
    if (peakDecayRef.current % 2 === 0) {
      historyRef.current.push(new Float32Array(dataArrayRef.current))
      if (historyRef.current.length > HISTORY_LENGTH) {
        historyRef.current.shift()
      }
      latestDetections = detectFeedback(
        dataArrayRef.current,
        audioContextRef.current?.sampleRate || 44100
      )
    }

    // Only update visual state if NOT frozen
    if (!isFrozen) {
      // Calculate RMS level
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
  }, [detectFeedback, isFrozen])

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

      // Connect source -> filters -> analyser
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

    filterNodesRef.current.forEach((node) => node.disconnect())
    filterNodesRef.current.clear()

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

    setFrequencyData(null)
    setTimeData(null)
    setPeakData(null)
    setFeedbackDetections([])
    setRmsLevel(-100)
    setIsFrozen(false)
    frozenDataRef.current = null
  }, [])

  const addFilter = useCallback(
    (frequency: number, gain: number = -12, q: number = 30) => {
      const audioContext = audioContextRef.current
      const source = sourceRef.current
      const analyser = analyserRef.current
      if (!audioContext || !source || !analyser) return

      const id = `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const biquadFilter = audioContext.createBiquadFilter()
      biquadFilter.type = "peaking"
      biquadFilter.frequency.value = frequency
      biquadFilter.gain.value = gain
      biquadFilter.Q.value = q

      // Rebuild the chain: source -> filters -> analyser
      source.disconnect()
      const allFilterNodes = [...filterNodesRef.current.values(), biquadFilter]

      // Connect chain
      let prev: AudioNode = source
      for (const filter of allFilterNodes) {
        prev.connect(filter)
        prev = filter
      }
      prev.connect(analyser)

      filterNodesRef.current.set(id, biquadFilter)

      const newFilter: FilterNode = {
        id,
        frequency,
        gain,
        q,
        type: "peaking",
        enabled: true,
        node: biquadFilter,
      }

      setFilters((prev) => [...prev, newFilter])
      return id
    },
    []
  )

  const updateFilter = useCallback(
    (id: string, updates: Partial<Pick<FilterNode, "frequency" | "gain" | "q" | "type" | "enabled">>) => {
      const node = filterNodesRef.current.get(id)
      if (!node) return

      if (updates.frequency !== undefined) node.frequency.value = updates.frequency
      if (updates.gain !== undefined) node.gain.value = updates.gain
      if (updates.q !== undefined) node.Q.value = updates.q
      if (updates.type !== undefined) node.type = updates.type

      setFilters((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                ...updates,
                node,
              }
            : f
        )
      )
    },
    []
  )

  const removeFilter = useCallback((id: string) => {
    const audioContext = audioContextRef.current
    const source = sourceRef.current
    const analyser = analyserRef.current
    if (!audioContext || !source || !analyser) return

    const nodeToRemove = filterNodesRef.current.get(id)
    if (nodeToRemove) {
      nodeToRemove.disconnect()
      filterNodesRef.current.delete(id)
    }

    // Rebuild the chain
    source.disconnect()
    const allFilterNodes = [...filterNodesRef.current.values()]

    if (allFilterNodes.length === 0) {
      source.connect(analyser)
    } else {
      let prev: AudioNode = source
      for (const filter of allFilterNodes) {
        prev.connect(filter)
        prev = filter
      }
      prev.connect(analyser)
    }

    setFilters((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const toggleFreeze = useCallback(() => {
    setIsFrozen((prev) => {
      if (!prev) {
        // Freezing: save a snapshot of current state
        frozenDataRef.current = {
          frequencyData: frequencyData ? new Float32Array(frequencyData) : null,
          peakData: peakData ? new Float32Array(peakData) : null,
          feedbackDetections: [...feedbackDetections],
          rmsLevel,
        }
      } else {
        // Unfreezing: clear snapshot
        frozenDataRef.current = null
      }
      return !prev
    })
  }, [frequencyData, peakData, feedbackDetections, rmsLevel])

  const clearAllFilters = useCallback(() => {
    const source = sourceRef.current
    const analyser = analyserRef.current
    if (!source || !analyser) return

    source.disconnect()
    filterNodesRef.current.forEach((node) => node.disconnect())
    filterNodesRef.current.clear()
    source.connect(analyser)
    setFilters([])
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
    updateFilter,
    removeFilter,
    clearAllFilters,
    toggleFreeze,
  }
}
