"use client"

import { useCallback } from "react"
import { useAudioEngine } from "@/hooks/use-audio-engine"
import { AppHeader } from "@/components/app-header"
import { SpectrumAnalyzer } from "@/components/spectrum-analyzer"
import { FilterControls } from "@/components/filter-controls"
import { FeedbackList } from "@/components/feedback-list"
import { LevelMeter } from "@/components/level-meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Info, SlidersHorizontal, AlertTriangle } from "lucide-react"

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
                  FROZEN
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
                    {feedbackDetections.length} FEEDBACK
                  </span>
                </div>
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
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-card/50">
            <div className="flex items-center gap-1.5 text-muted-foreground/60">
              <Info className="h-3 w-3" />
              <span className="text-[10px] font-mono">
                Click spectrum to place a notch filter | Use + to add detected frequencies
              </span>
            </div>
            <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground/40">
              20 Hz - 20 kHz | Log Scale
            </span>
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
                    onAddFilter={handleAddFilterFromDetection}
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
