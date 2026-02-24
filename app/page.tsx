"use client"

import { useCallback, useState, useEffect, useRef } from "react"
import { useAudioEngine, type HistoricalDetection } from "@/hooks/use-audio-engine"
import { AppHeader } from "@/components/app-header"
import { SpectrumAnalyzer } from "@/components/spectrum-analyzer"
import { TelemetryPanel } from "@/components/telemetry-card"
import { SessionLog } from "@/components/session-log"
import { FilterControls } from "@/components/filter-controls"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DEFAULT_SETTINGS, type AppSettings } from "@/components/settings-panel"
import { Crosshair, SlidersHorizontal, Clock } from "lucide-react"

export default function FeedbackAnalyzerPage() {
  const {
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
  const autoFilteredFreqsRef = useRef<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState("telemetry")

  // Severity-scaled filter presets
  const getFilterPreset = useCallback(
    (magnitude: number): { gain: number; q: number } => {
      if (magnitude > -15) return { gain: settings.filterGainCritical, q: settings.filterQCritical }
      return { gain: settings.filterGainHigh, q: settings.filterQHigh }
    },
    [settings.filterGainCritical, settings.filterQCritical, settings.filterGainHigh, settings.filterQHigh]
  )

  // Retention times
  const getRetentionTime = useCallback(
    (peakMagnitude: number): number => {
      if (peakMagnitude > -15) return settings.retentionCritical === 0 ? Infinity : settings.retentionCritical
      if (peakMagnitude > -25) return settings.retentionHigh === 0 ? Infinity : settings.retentionHigh
      if (peakMagnitude > -35) return settings.retentionMedium === 0 ? Infinity : settings.retentionMedium
      return settings.retentionLow === 0 ? Infinity : settings.retentionLow
    },
    [settings.retentionCritical, settings.retentionHigh, settings.retentionMedium, settings.retentionLow]
  )

  // Merge live detections into sticky history
  useEffect(() => {
    if (!state.isActive || isFrozen) return
    const now = Date.now()

    setDetectionHistory((prev) => {
      const updated = prev.map((h) => ({ ...h }))
      for (const h of updated) h.isActive = false

      for (const det of feedbackDetections) {
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

      updated.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return b.peakMagnitude - a.peakMagnitude
      })

      return updated
    })

    // Auto-create notch filters
    if (!settings.autoFilterEnabled) return
    let autoFilterCreated = false
    for (const det of feedbackDetections) {
      if (det.magnitude <= settings.autoFilterThreshold) continue
      const alreadyFiltered = Array.from(autoFilteredFreqsRef.current).some((f) => {
        const ratio = det.frequency / f
        return ratio > 0.92 && ratio < 1.08
      })
      const manualFilterExists = filters.some((f) => {
        const ratio = det.frequency / f.frequency
        return ratio > 0.92 && ratio < 1.08
      })
      if (!alreadyFiltered && !manualFilterExists) {
        autoFilteredFreqsRef.current.add(det.frequency)
        const preset = getFilterPreset(det.magnitude)
        addFilter(det.frequency, preset.gain, preset.q)
        autoFilterCreated = true
      }
    }
    if (autoFilterCreated) setActiveTab("filters")
  }, [feedbackDetections, state.isActive, isFrozen, filters, addFilter, getFilterPreset, settings.autoFilterEnabled, settings.autoFilterThreshold])

  // On start/stop
  const prevActiveRef = useRef(false)
  useEffect(() => {
    if (state.isActive && !prevActiveRef.current) {
      if (settings.clearOnStart) {
        setDetectionHistory([])
        historyIdCounter.current = 0
        autoFilteredFreqsRef.current.clear()
      }
      if (settings.clearFiltersOnStart) clearAllFilters()
      setActiveTab("telemetry")
    }
    if (!state.isActive && prevActiveRef.current) {
      setDetectionHistory((prev) => prev.map((h) => ({ ...h, isActive: false })))
    }
    prevActiveRef.current = state.isActive
  }, [state.isActive, settings.clearOnStart, settings.clearFiltersOnStart, clearAllFilters])

  const clearHistory = useCallback(() => {
    setDetectionHistory([])
    historyIdCounter.current = 0
    autoFilteredFreqsRef.current.clear()
  }, [])

  const dismissDetection = useCallback((id: string) => {
    setDetectionHistory((prev) => prev.filter((h) => h.id !== id))
  }, [])

  // Timed retention cleanup
  useEffect(() => {
    if (detectionHistory.length === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      setDetectionHistory((prev) =>
        prev.filter((h) => {
          if (h.isActive) return true
          const retention = getRetentionTime(h.peakMagnitude)
          if (retention === Infinity) return true
          return (now - h.lastSeen) / 1000 < retention
        })
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [detectionHistory.length, getRetentionTime])

  const handleFrequencyClick = useCallback(
    (frequency: number) => {
      if (!state.isActive) return
      addFilter(frequency, -10, 25)
      setActiveTab("filters")
    },
    [state.isActive, addFilter]
  )

  const handleAddFilterFromDetection = useCallback(
    (frequency: number) => {
      const det = detectionHistory.find((h) => {
        const ratio = frequency / h.frequency
        return ratio > 0.95 && ratio < 1.05
      })
      const preset = det ? getFilterPreset(det.magnitude) : { gain: -10, q: 25 }
      addFilter(frequency, preset.gain, preset.q)
      setActiveTab("filters")
    },
    [addFilter, detectionHistory, getFilterPreset]
  )

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <AppHeader
        isActive={state.isActive}
        isFrozen={isFrozen}
        sampleRate={state.sampleRate}
        rmsLevel={rmsLevel}
        settings={settings}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
        onStart={start}
        onStop={stop}
        onToggleFreeze={toggleFreeze}
      />

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* The Main Stage: RTA Canvas (70% desktop, 50vh mobile) */}
        <div className="flex-1 lg:w-[70%] flex flex-col min-w-0 min-h-0 h-[50vh] lg:h-auto">
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
            </div>
            <div className="flex items-center gap-3">
              {feedbackDetections.length > 0 && (
                <span className="font-mono text-[10px] font-bold text-feedback-danger">
                  {feedbackDetections.length} RING{feedbackDetections.length !== 1 ? "S" : ""}
                </span>
              )}
              <span className="font-mono text-[9px] text-muted-foreground/30">
                20 Hz - 20 kHz
              </span>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 p-1.5 min-h-0">
            <SpectrumAnalyzer
              frequencyData={frequencyData}
              peakData={peakData}
              feedbackDetections={feedbackDetections}
              historicalDetections={detectionHistory}
              sampleRate={state.sampleRate}
              fftSize={state.fftSize}
              isFrozen={isFrozen}
              showPeakHold={settings.showPeakHold}
              onFrequencyClick={handleFrequencyClick}
            />
          </div>
        </div>

        {/* Sidecar Panel (30% desktop, below canvas on mobile) */}
        <aside className="w-full lg:w-[30%] lg:min-w-[320px] lg:max-w-[420px] border-t lg:border-t-0 lg:border-l border-border bg-[#0e0e0e] flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-3 rounded-none border-b border-border bg-transparent h-10 shrink-0">
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
                value="filters"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-mono text-[10px] uppercase tracking-wider gap-1"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Filters
                {filters.length > 0 && (
                  <span className="text-[9px] bg-primary/20 text-primary px-1 rounded-full font-bold">
                    {filters.length}
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
                  <TelemetryPanel
                    detections={feedbackDetections}
                    history={detectionHistory}
                    onAddFilter={handleAddFilterFromDetection}
                    onDismiss={dismissDetection}
                    isActive={state.isActive}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="filters" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="p-3">
                  <FilterControls
                    filters={filters}
                    onRemoveFilter={removeFilter}
                    onClearAll={clearAllFilters}
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
