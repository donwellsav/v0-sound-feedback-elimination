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
  // Polling rate: how many animation frames between each detection pass
  // 1 = every frame (~60/s), 6 = ~10/s, 12 = ~5/s
  const [pollInterval, setPollInterval] = useState<number>(3)
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
    if (!persistence) return detections

    // ---- Step 1: Compute adaptive noise floor ----
    // Use the 25th percentile of active bins as the noise floor estimate
    const activeBins: number[] = []
    for (let i = 0; i < data.length; i++) {
      if (data[i] > -100) activeBins.push(data[i])
    }
    activeBins.sort((a, b) => a - b)
    const noiseFloor = activeBins.length > 0
      ? activeBins[Math.floor(activeBins.length * 0.25)]
      : -90

    // Peak must be at least 12 dB above noise floor, and at least -55 dB absolute
    const absoluteThreshold = Math.max(noiseFloor + 12, -55)

    // ---- Step 2: Scan for narrow-band peaks ----
    for (let i = 5; i < data.length - 5; i++) {
      const freq = i * binWidth
      if (freq < 80 || freq > 12000) continue

      const val = data[i]

      // Fast reject: below absolute threshold
      if (val < absoluteThreshold) {
        persistence[i] = Math.max(0, persistence[i] - 2)
        continue
      }

      // Must be a strict local maximum over +-5 bins
      let isLocalMax = true
      for (let k = 1; k <= 5; k++) {
        if (data[i - k] > val || data[i + k] > val) {
          isLocalMax = false
          break
        }
      }
      if (!isLocalMax) {
        persistence[i] = Math.max(0, persistence[i] - 2)
        continue
      }

      // ---- Step 3: Measure peak sharpness (narrowness) ----
      // Feedback is extremely narrow-band. Measure how quickly the peak
      // drops off on either side. We look for the -6 dB points.
      let leftWidth = 0
      for (let k = 1; k <= 20 && (i - k) >= 0; k++) {
        if (val - data[i - k] >= 6) { leftWidth = k; break }
      }
      let rightWidth = 0
      for (let k = 1; k <= 20 && (i + k) < data.length; k++) {
        if (val - data[i + k] >= 6) { rightWidth = k; break }
      }

      // If we couldn't find -6dB points within 20 bins, peak is too wide (not feedback)
      if (leftWidth === 0 || rightWidth === 0) {
        persistence[i] = Math.max(0, persistence[i] - 2)
        continue
      }

      const peakWidthBins = leftWidth + rightWidth
      const peakWidthHz = peakWidthBins * binWidth

      // Feedback peaks are typically < 50 Hz wide. Allow up to 80 Hz for lower frequencies.
      const maxWidthHz = freq < 300 ? 80 : 50
      if (peakWidthHz > maxWidthHz) {
        persistence[i] = Math.max(0, persistence[i] - 2)
        continue
      }

      // ---- Step 4: Measure prominence against a wider neighborhood ----
      // Use a window of ~1/3 octave on each side, excluding the narrow peak region
      const octaveWindow = Math.max(15, Math.floor(i * 0.2))
      const winStart = Math.max(0, i - octaveWindow)
      const winEnd = Math.min(data.length, i + octaveWindow + 1)
      const excludeRadius = Math.max(3, Math.ceil(peakWidthBins / 2) + 2)
      let sum = 0
      let count = 0
      for (let j = winStart; j < winEnd; j++) {
        if (Math.abs(j - i) > excludeRadius) {
          sum += data[j]
          count++
        }
      }
      const localFloor = count > 0 ? sum / count : val
      const prominence = val - localFloor

      // Require at least 12 dB prominence (feedback sticks out sharply)
      if (prominence < 12) {
        persistence[i] = Math.max(0, persistence[i] - 1)
        continue
      }

      // ---- Step 5: Persistence tracking ----
      // Feedback sustains over time. Increment slowly, require many frames.
      persistence[i] = Math.min(persistence[i] + 1, 40)

      // Need at least 8 accumulated frames (~0.25s at 60fps/2) before flagging
      if (persistence[i] < 8) continue

      detections.push({
        frequency: freq,
        magnitude: val,
        binIndex: i,
        timestamp: Date.now(),
      })
    }

    // ---- Step 6: Merge nearby detections (within 1/6 octave) ----
    const merged: FeedbackDetection[] = []
    const used = new Set<number>()
    detections.sort((a, b) => b.magnitude - a.magnitude)

    for (const det of detections) {
      if (used.has(det.binIndex)) continue
      for (const other of detections) {
        if (other === det) continue
        const ratio = other.frequency / det.frequency
        if (ratio > 0.9 && ratio < 1.1) {
          used.add(other.binIndex)
        }
      }
      merged.push(det)
    }

    // Decay all non-peak bins gradually so stale peaks clear out
    for (let i = 0; i < persistence.length; i++) {
      const isDetected = detections.some(d => Math.abs(d.binIndex - i) <= 2)
      if (!isDetected && persistence[i] > 0) {
        persistence[i] = Math.max(0, persistence[i] - 0.5)
      }
    }

    return merged.slice(0, 6)
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
    if (peakDecayRef.current % pollInterval === 0) {
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
  }, [detectFeedback, isFrozen, pollInterval])

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
      analyser.smoothingTimeConstant = 0.65
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
    pollInterval,
    start,
    stop,
    addFilter,
    updateFilter,
    removeFilter,
    clearAllFilters,
    toggleFreeze,
    setPollInterval,
  }
}
