"use client"

import { useCallback, useState, useEffect, useRef } from "react"
import { useAudioEngine, type HistoricalDetection } from "@/hooks/use-audio-engine"
import { AppHeader } from "@/components/app-header"
import RTASpectrum from "@/components/rta-spectrum"
import { TargetHitList } from "@/components/target-hit-list"
import { SessionLog } from "@/components/session-log"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DEFAULT_SETTINGS, type AppSettings } from "@/components/settings-drawer"
import { Crosshair, Clock } from "lucide-react"

export default function FeedbackAnalyzerPage() {
  const {
    state,
    detectorRef,
    feedbackDetections,
    rmsLevel,
    isFrozen,
    start,
    stop,
    toggleFreeze,
  } = useAudioEngine()

  // ---- Spacebar shortcut for Pause/Resume ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (!state.isActive) return
      e.preventDefault()
      toggleFreeze()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [state.isActive, toggleFreeze])

  // ---- Settings ----
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }))
  }, [])
  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), [])

  // ---- Detection History ----
  const [detectionHistory, setDetectionHistory] = useState<HistoricalDetection[]>([])
  const historyIdCounter = useRef(0)
  const [activeTab, setActiveTab] = useState("telemetry")

  // Merge live detections into sticky history
  const feedbackDetectionsRef = useRef(feedbackDetections)
  feedbackDetectionsRef.current = feedbackDetections

  useEffect(() => {
    if (!state.isActive || isFrozen) return

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
        const updated = prev.map((h) => ({ ...h, isActive: false }))

        for (const det of dets) {
          const existing = updated.find((h) => {
            const ratio = det.frequency / h.frequency
            return ratio > 0.92 && ratio < 1.08
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
    }, 500)

    return () => clearInterval(interval)
  }, [state.isActive, isFrozen])

  // On start/stop
  const prevActiveRef = useRef(false)
  useEffect(() => {
    if (state.isActive && !prevActiveRef.current) {
      if (settings.clearOnStart) {
        setDetectionHistory([])
        historyIdCounter.current = 0
      }
      setActiveTab("telemetry")
    }
    if (!state.isActive && prevActiveRef.current) {
      setDetectionHistory((prev) => prev.map((h) => ({ ...h, isActive: false })))
    }
    prevActiveRef.current = state.isActive
  }, [state.isActive, settings.clearOnStart])

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
    const retSec = settings.historyRetention
    if (retSec === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      setDetectionHistory((prev) =>
        prev.filter((h) => {
          if (h.isActive) return true
          return (now - h.lastSeen) / 1000 < retSec
        })
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [detectionHistory.length, settings.historyRetention])

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <AppHeader
        isActive={state.isActive}
        isFrozen={isFrozen}
        sampleRate={state.sampleRate}
        rmsLevel={rmsLevel}
        detectorRef={detectorRef}
        settings={settings}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
        onStart={start}
        onStop={stop}
        onToggleFreeze={toggleFreeze}
      />

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* RTA Canvas */}
        <div className="flex-1 lg:w-[70%] flex flex-col min-w-0 min-h-0 h-[35vh] lg:h-auto">
          {/* Status strip */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-[#0e0e0e] border-b border-border">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-widest">
                RTA
              </span>
              {state.isActive && (
                <span className="font-mono text-[9px] text-muted-foreground/40">
                  FFT {state.fftSize}
                </span>
              )}
              {state.noiseFloorDb != null && (
                <span className="font-mono text-[9px] text-muted-foreground/30">
                  Floor {state.noiseFloorDb.toFixed(0)}dB
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {feedbackDetections.length > 0 && (
                <span className="font-mono text-[10px] font-bold text-feedback-danger">
                  {feedbackDetections.length} RING{feedbackDetections.length !== 1 ? "S" : ""}
                </span>
              )}
              <span className="font-mono text-[9px] text-muted-foreground/30">
                80 Hz - 12 kHz
              </span>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 p-1.5 min-h-0">
            <RTASpectrum
              detectorRef={detectorRef}
              isRunning={state.isActive}
            />
          </div>
        </div>

        {/* Sidecar Panel */}
        <aside className="w-full lg:w-[30%] lg:min-w-[320px] lg:max-w-[420px] border-t lg:border-t-0 lg:border-l border-border bg-[#0e0e0e] flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-2 rounded-none border-b border-border bg-transparent h-10 shrink-0">
              <TabsTrigger
                value="telemetry"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-feedback-danger data-[state=active]:bg-transparent font-mono text-[10px] uppercase tracking-wider gap-1"
              >
                <Crosshair className="h-3 w-3" />
                Targets
                {feedbackDetections.length > 0 && (
                  <span className="text-[9px] bg-feedback-danger/20 text-feedback-danger px-1 rounded-full font-bold">
                    {feedbackDetections.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="log"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-muted-foreground data-[state=active]:bg-transparent font-mono text-[10px] uppercase tracking-wider gap-1"
              >
                <Clock className="h-3 w-3" />
                Log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="telemetry" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="p-3">
                  <TargetHitList
                    activeHits={detectionHistory}
                    onDismiss={dismissDetection}
                    isEngineActive={state.isActive}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="log" className="flex-1 min-h-0 mt-0">
              <div className="p-3 h-full">
                <SessionLog history={detectionHistory} onClearHistory={clearHistory} />
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  )
}
