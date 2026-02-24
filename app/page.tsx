"use client"

import { useCallback, useState, useEffect, useRef } from "react"
import { useAudioEngine, type FeedbackDetection, type HistoricalDetection } from "@/hooks/use-audio-engine"
import { AppHeader } from "@/components/app-header"
import { SpectrumAnalyzer } from "@/components/spectrum-analyzer"
import { FilterControls } from "@/components/filter-controls"
import { FeedbackList } from "@/components/feedback-list"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsPanel, DEFAULT_SETTINGS, type AppSettings } from "@/components/settings-panel"
import { Info, SlidersHorizontal, AlertTriangle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

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
    updateFilter,
    removeFilter,
    clearAllFilters,
    toggleFreeze,
  } = useAudioEngine()

  // ---- Spacebar shortcut for Pause/Resume ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on spacebar, and not when typing in an input/textarea
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
  // Track which frequencies already have auto-created filters (to avoid duplicates)
  const autoFilteredFreqsRef = useRef<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState("detections")

  // Severity-scaled filter presets (driven by settings)
  const getFilterPreset = useCallback((magnitude: number): { gain: number; q: number } => {
    if (magnitude > -15) return { gain: settings.filterGainCritical, q: settings.filterQCritical }
    return { gain: settings.filterGainHigh, q: settings.filterQHigh }
  }, [settings.filterGainCritical, settings.filterQCritical, settings.filterGainHigh, settings.filterQHigh])

  // Retention times per severity (driven by settings). 0 = until cleared (Infinity).
  const getRetentionTime = useCallback((peakMagnitude: number): number => {
    if (peakMagnitude > -15) return settings.retentionCritical === 0 ? Infinity : settings.retentionCritical
    if (peakMagnitude > -25) return settings.retentionHigh === 0 ? Infinity : settings.retentionHigh
    if (peakMagnitude > -35) return settings.retentionMedium === 0 ? Infinity : settings.retentionMedium
    return settings.retentionLow === 0 ? Infinity : settings.retentionLow
  }, [settings.retentionCritical, settings.retentionHigh, settings.retentionMedium, settings.retentionLow])

  // Merge live detections into sticky history (skip when paused)
  useEffect(() => {
    if (!state.isActive || isFrozen) return

    const now = Date.now()

    setDetectionHistory((prev) => {
      const updated = prev.map((h) => ({ ...h }))

      // Mark all as inactive first
      for (const h of updated) {
        h.isActive = false
      }

      // Match each live detection to an existing history entry or create new
      for (const det of feedbackDetections) {
        // Find existing entry within ~1/6 octave
        const existing = updated.find((h) => {
          const ratio = det.frequency / h.frequency
          return ratio > 0.92 && ratio < 1.08
        })

        if (existing) {
          // Update existing entry
          existing.lastSeen = now
          existing.hitCount += 1
          existing.isActive = true
          existing.magnitude = det.magnitude
          existing.binIndex = det.binIndex
          if (det.magnitude > existing.peakMagnitude) {
            existing.peakMagnitude = det.magnitude
          }
          // Update frequency to the latest peak position
          existing.frequency = det.frequency
        } else {
          // New detection
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

      // Sort: active first, then by peak magnitude
      updated.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return b.peakMagnitude - a.peakMagnitude
      })

      return updated
    })
    // Auto-create notch filters for severe detections
    if (!settings.autoFilterEnabled) return
    let autoFilterCreated = false
    for (const det of feedbackDetections) {
      if (det.magnitude <= settings.autoFilterThreshold) continue

      // Check if we already auto-created a filter near this frequency
      const alreadyFiltered = Array.from(autoFilteredFreqsRef.current).some((f) => {
        const ratio = det.frequency / f
        return ratio > 0.92 && ratio < 1.08
      })

      // Also check if a manual filter already exists near this frequency
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

    // Auto-switch to Filters tab when a new auto-filter is created
    if (autoFilterCreated) {
      setActiveTab("filters")
    }
  }, [feedbackDetections, state.isActive, isFrozen, filters, addFilter, getFilterPreset, settings.autoFilterEnabled, settings.autoFilterThreshold])

  // On start: optionally clear detections and filters
  const prevActiveRef = useRef(false)
  useEffect(() => {
    if (state.isActive && !prevActiveRef.current) {
      // Just became active
      if (settings.clearOnStart) {
        setDetectionHistory([])
        historyIdCounter.current = 0
        autoFilteredFreqsRef.current.clear()
      }
      if (settings.clearFiltersOnStart) {
        clearAllFilters()
      }
      setActiveTab("detections")
    }
    if (!state.isActive && prevActiveRef.current) {
      // Just stopped: mark all as inactive
      setDetectionHistory((prev) =>
        prev.map((h) => ({ ...h, isActive: false }))
      )
    }
    prevActiveRef.current = state.isActive
  }, [state.isActive, settings.clearOnStart, settings.clearFiltersOnStart, clearAllFilters])

  const clearHistory = useCallback(() => {
    setDetectionHistory([])
    historyIdCounter.current = 0
    autoFilteredFreqsRef.current.clear()
  }, [])

  // Timed retention: remove stale detections after their severity-based hold time
  // CRITICAL: persist until cleared, HIGH: 20s, MEDIUM: 10s, LOW: 5s
  useEffect(() => {
    if (detectionHistory.length === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      setDetectionHistory((prev) =>
        prev.filter((h) => {
          if (h.isActive) return true // always keep active
          const retention = getRetentionTime(h.peakMagnitude)
          if (retention === Infinity) return true // CRITICAL: keep until cleared
          const elapsed = (now - h.lastSeen) / 1000
          return elapsed < retention
        })
      )
    }, 1000) // check every second
    return () => clearInterval(interval)
  }, [detectionHistory.length, getRetentionTime])

  const visibleHistory = detectionHistory
  const fullHistory = detectionHistory

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
      // Find the detection to get its magnitude for severity-scaled preset
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
        {/* Spectrum Analyzer - Main Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Status Bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
            <div className="flex items-center gap-4">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                RTA Spectrum
              </span>
              {isFrozen && (
                <span className="font-mono text-[10px] text-feedback-warning font-bold border border-feedback-warning/30 bg-feedback-warning/10 px-2 py-0.5 rounded">
                  PAUSED
                </span>
              )}
              {state.isActive && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  FFT: {state.fftSize} | Bins: {state.fftSize / 2}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {feedbackDetections.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-feedback-danger" />
                  <span className="font-mono text-[10px] text-feedback-danger font-bold">
                    {feedbackDetections.length} LIVE
                  </span>
                </div>
              )}
              {detectionHistory.length > 0 && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {detectionHistory.length} total
                </span>
              )}
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 p-2 min-h-0">
            <SpectrumAnalyzer
              frequencyData={frequencyData}
              peakData={peakData}
              feedbackDetections={feedbackDetections}
              historicalDetections={visibleHistory}
              sampleRate={state.sampleRate}
              fftSize={state.fftSize}
              isFrozen={isFrozen}
              showPeakHold={settings.showPeakHold}
              onFrequencyClick={handleFrequencyClick}
            />
          </div>

          {/* Bottom Info Bar */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-card/50 gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground/60 shrink-0">
              <Info className="h-3 w-3" />
              <span className="text-[10px] font-mono hidden md:inline">
                Click spectrum to place a notch filter
              </span>
            </div>
            {detectionHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="h-6 px-2 gap-1 text-[10px] font-mono text-muted-foreground hover:text-feedback-danger"
              >
                <Trash2 className="h-3 w-3" />
                Clear All Markers
              </Button>
            )}
            <div className="flex items-center gap-3 shrink-0">
              {detectionHistory.length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground/60">
                  {detectionHistory.length} logged
                </span>
              )}
              <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground/40">
                20 Hz - 20 kHz
              </span>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Controls Panel */}
        <aside className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-2 rounded-none border-b border-border bg-transparent h-10">
              <TabsTrigger
                value="detections"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-mono text-xs gap-1.5"
              >
                <AlertTriangle className="h-3 w-3" />
                Detections
                {feedbackDetections.length > 0 && (
                  <span className="ml-1 text-[10px] bg-feedback-danger/20 text-feedback-danger px-1.5 rounded-full font-bold">
                    {feedbackDetections.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="filters"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-mono text-xs gap-1.5"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Filters
                {filters.length > 0 && (
                  <span className="ml-1 text-[10px] bg-primary/20 text-primary px-1.5 rounded-full font-bold">
                    {filters.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="detections" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <FeedbackList
                    detections={feedbackDetections}
                    history={fullHistory}
                    onAddFilter={handleAddFilterFromDetection}
                    onClearHistory={clearHistory}
                    isActive={state.isActive}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="filters" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <FilterControls
                    filters={filters}
                    onUpdateFilter={updateFilter}
                    onRemoveFilter={removeFilter}
                    onClearAll={clearAllFilters}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  )
}
