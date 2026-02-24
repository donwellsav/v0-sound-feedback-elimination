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

  const detectFeedback = useCallback((data: Float32Array, sampleRate: number) => {
    const detections: FeedbackDetection[] = []
    const binWidth = sampleRate / FFT_SIZE
    const threshold = -20
    const prominenceThreshold = 15

    for (let i = 2; i < data.length - 2; i++) {
      const freq = i * binWidth
      if (freq < 80 || freq > 16000) continue

      const val = data[i]
      if (val < threshold) continue

      // Check if this is a local peak
      if (val > data[i - 1] && val > data[i + 1] && val > data[i - 2] && val > data[i + 2]) {
        // Check prominence: how much higher than nearby average
        const windowSize = Math.max(10, Math.floor(i * 0.1))
        const start = Math.max(0, i - windowSize)
        const end = Math.min(data.length, i + windowSize)
        let sum = 0
        let count = 0
        for (let j = start; j < end; j++) {
          if (j !== i) {
            sum += data[j]
            count++
          }
        }
        const average = sum / count
        const prominence = val - average

        if (prominence > prominenceThreshold) {
          detections.push({
            frequency: freq,
            magnitude: val,
            binIndex: i,
            timestamp: Date.now(),
          })
        }
      }
    }

    // Sort by magnitude and limit
    detections.sort((a, b) => b.magnitude - a.magnitude)
    return detections.slice(0, 8)
  }, [])

  const updateAnalysis = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser || !dataArrayRef.current || !timeDataRef.current || !peakHoldRef.current) return

    analyser.getFloatFrequencyData(dataArrayRef.current)
    analyser.getFloatTimeDomainData(timeDataRef.current)

    // Update peak hold
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      if (dataArrayRef.current[i] > peakHoldRef.current[i]) {
        peakHoldRef.current[i] = dataArrayRef.current[i]
      } else {
        peakHoldRef.current[i] -= 0.3 // decay rate
      }
    }

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

    // Detect feedback
    peakDecayRef.current++
    if (peakDecayRef.current % 5 === 0) {
      const detections = detectFeedback(
        dataArrayRef.current,
        audioContextRef.current?.sampleRate || 44100
      )
      setFeedbackDetections(detections)
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
      analyser.smoothingTimeConstant = 0.7
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
    start,
    stop,
    addFilter,
    updateFilter,
    removeFilter,
    clearAllFilters,
  }
}
