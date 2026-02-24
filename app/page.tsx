"use client"

import { useCallback, useState, useEffect, useRef } from "react"
import { useAudioEngine, type FeedbackDetection, type HistoricalDetection } from "@/hooks/use-audio-engine"
import { AppHeader } from "@/components/app-header"
import { SpectrumAnalyzer } from "@/components/spectrum-analyzer"
import { FilterControls } from "@/components/filter-controls"
import { FeedbackList } from "@/components/feedback-list"
import { LevelMeter } from "@/components/level-meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

  // ---- Detection History ----
  const [detectionHistory, setDetectionHistory] = useState<HistoricalDetection[]>([])
  const historyIdCounter = useRef(0)

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
  }, [feedbackDetections, state.isActive, isFrozen])

  // Mark all detections as inactive when stopping (but keep them in history)
  useEffect(() => {
    if (!state.isActive) {
      setDetectionHistory((prev) =>
        prev.map((h) => ({ ...h, isActive: false }))
      )
    }
  }, [state.isActive])

  const clearHistory = useCallback(() => {
    setDetectionHistory([])
    historyIdCounter.current = 0
  }, [])

  // All detections persist on both spectrum and list until manually cleared
  const visibleHistory = detectionHistory
  const fullHistory = detectionHistory

  const handleFrequencyClick = useCallback(
    (frequency: number) => {
      if (!state.isActive) return
      addFilter(frequency, -12, 30)
    },
    [state.isActive, addFilter]
  )

  const handleAddFilterFromDetection = useCallback(
    (frequency: number) => {
      addFilter(frequency, -12, 30)
    },
    [addFilter]
  )

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <AppHeader
        isActive={state.isActive}
        isFrozen={isFrozen}
        sampleRate={state.sampleRate}
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
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 p-2 min-w-0">
              <SpectrumAnalyzer
                frequencyData={frequencyData}
                peakData={peakData}
                feedbackDetections={feedbackDetections}
                historicalDetections={visibleHistory}
                sampleRate={state.sampleRate}
                fftSize={state.fftSize}
                isFrozen={isFrozen}
                onFrequencyClick={handleFrequencyClick}
              />
            </div>

            {/* Level Meter */}
            <div className="hidden md:flex flex-col items-center justify-center px-3 border-l border-border bg-card/30">
              <LevelMeter level={rmsLevel} />
            </div>
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
          <Tabs defaultValue="detections" className="flex flex-col flex-1 min-h-0">
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

          {/* Quick Reference */}
          <div className="border-t border-border px-4 py-3 bg-secondary/30">
            <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Common Feedback Ranges
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { range: "250-500 Hz", desc: "Boominess / Mud" },
                { range: "1-2 kHz", desc: "Nasal / Honk" },
                { range: "2-4 kHz", desc: "Harshness / Bite" },
                { range: "4-8 kHz", desc: "Sibilance / Ring" },
              ].map((item) => (
                <div key={item.range} className="flex flex-col">
                  <span className="font-mono text-[10px] text-feedback-warning">{item.range}</span>
                  <span className="text-[10px] text-muted-foreground/60">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
