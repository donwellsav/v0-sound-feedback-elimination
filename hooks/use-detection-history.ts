import { useState, useRef, useEffect, useCallback } from "react"
import type { FeedbackDetection, HistoricalDetection } from "@/hooks/use-audio-engine"
import { AUDIO_CONSTANTS, DETECTION_CONSTANTS } from "@/lib/constants"

interface UseDetectionHistoryProps {
  isActive: boolean
  isFrozen: boolean
  feedbackDetections: FeedbackDetection[]
  clearOnStart: boolean
  historyRetention: number
}

export function useDetectionHistory({
  isActive,
  isFrozen,
  feedbackDetections,
  clearOnStart,
  historyRetention,
}: UseDetectionHistoryProps) {
  const [detectionHistory, setDetectionHistory] = useState<HistoricalDetection[]>([])
  const historyIdCounter = useRef(0)

  // Merge live detections into sticky history
  const feedbackDetectionsRef = useRef(feedbackDetections)
  feedbackDetectionsRef.current = feedbackDetections

  useEffect(() => {
    if (!isActive || isFrozen) return

    const interval = setInterval(() => {
      const dets = feedbackDetectionsRef.current
      if (dets.length === 0) {
        setDetectionHistory((prev) => {
          const anyActive = prev.some((h) => h.isActive)
          if (!anyActive) return prev
          return prev.map((h) => (h.isActive ? { ...h, isActive: false } : h))
        })
        return
      }

      const now = Date.now()
      setDetectionHistory((prev) => {
        const updated = [...prev.map((h) => ({ ...h, isActive: false }))]

        for (const det of dets) {
          const existing = updated.find((h) => {
            const ratio = det.frequency / h.frequency
            return ratio > DETECTION_CONSTANTS.MERGE_RATIO_MIN && ratio < DETECTION_CONSTANTS.MERGE_RATIO_MAX
          })

          if (existing) {
            existing.lastSeen = now
            existing.hitCount += 1
            existing.isActive = true
            existing.magnitude = det.magnitude
            existing.binIndex = det.binIndex
            if (det.magnitude > existing.peakMagnitude) existing.peakMagnitude = det.magnitude
            existing.frequency = det.frequency
          } else {
            historyIdCounter.current++
            updated.push({
              ...det,
              id: `det-${historyIdCounter.current}`,
              firstSeen: now,
              lastSeen: now,
              hitCount: 1,
              peakMagnitude: det.magnitude,
              isActive: true,
            })
          }
        }

        updated.sort((a, b) => a.frequency - b.frequency)
        return updated
      })
    }, AUDIO_CONSTANTS.DETECTION_UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isActive, isFrozen])

  // On start/stop
  const prevActiveRef = useRef(false)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      if (clearOnStart) {
        setDetectionHistory([])
        historyIdCounter.current = 0
      }
    }
    if (!isActive && prevActiveRef.current) {
      setDetectionHistory((prev) => prev.map((h) => ({ ...h, isActive: false })))
    }
    prevActiveRef.current = isActive
  }, [isActive, clearOnStart])

  const clearHistory = useCallback(() => {
    setDetectionHistory([])
    historyIdCounter.current = 0
  }, [])

  const dismissDetection = useCallback((id: string) => {
    setDetectionHistory((prev) => prev.filter((h) => h.id !== id))
  }, [])

  // Timed retention cleanup
  useEffect(() => {
    if (detectionHistory.length === 0) return
    const retSec = historyRetention
    if (retSec === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      setDetectionHistory((prev) =>
        prev.filter((h) => {
          if (h.isActive) return true
          return (now - h.lastSeen) / 1000 < retSec
        })
      )
    }, DETECTION_CONSTANTS.HISTORY_CLEANUP_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [detectionHistory.length, historyRetention])

  return {
    detectionHistory,
    clearHistory,
    dismissDetection,
  }
}
