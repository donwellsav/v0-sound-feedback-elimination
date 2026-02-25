"use client"

import { useCallback, useState } from "react"
import { useAudioEngine } from "@/hooks/use-audio-engine"
import { useDetectionHistory } from "@/hooks/use-detection-history"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { AppHeader } from "@/components/app-header"
import { SpectrumAnalyzer } from "@/components/spectrum-analyzer"
import { TelemetryPanel } from "@/components/telemetry-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DEFAULT_SETTINGS, type AppSettings } from "@/components/settings-panel"
import { Crosshair } from "lucide-react"
import { AUDIO_CONSTANTS } from "@/lib/constants"

export default function FeedbackAnalyzerPage() {
  const {
    state,
    detectorRef,
    frequencyData,
    peakData,
    feedbackDetections,
    rmsLevel,
    inputGainDb,
    setInputGain,
    isFrozen,
    start,
    stop,
    toggleFreeze,
  } = useAudioEngine()

  // ---- Settings ----
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }))
  }, [])
  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), [])

  // ---- Detection History ----
  const { detectionHistory, clearHistory, dismissDetection } = useDetectionHistory({
    isActive: state.isActive,
    isFrozen,
    feedbackDetections,
    clearOnStart: settings.clearOnStart,
    historyRetention: settings.historyRetention,
  })

  // ---- Spacebar shortcut for Pause/Resume ----
  useKeyboardShortcuts({
    isActive: state.isActive,
    onToggleFreeze: toggleFreeze,
  })

  // Drag threshold line -> update detector's relativeThresholdDb (the gap above noise floor)
  const handleThresholdDrag = useCallback(
    (newEffectiveDb: number) => {
      const det = detectorRef.current
      if (!det) return
      const nf = det.noiseFloorDb
      if (nf != null) {
        // User is dragging the effective threshold to newEffectiveDb.
        // relative = effective - noiseFloor. Clamp to 5..40 dB gap.
        const newRelative = Math.max(5, Math.min(95, Math.round(newEffectiveDb - nf)))
        det.setRelativeThresholdDb(newRelative)
      } else {
        // No noise floor yet -- adjust absolute threshold instead
        const clamped = Math.max(-100, Math.min(-5, Math.round(newEffectiveDb)))
        det.setThresholdDb(clamped)
      }
    },
    [detectorRef]
  )

  // Drag noise floor line -> override detector's adaptive noise floor
  const handleNoiseFloorDrag = useCallback(
    (newDb: number) => {
      const det = detectorRef.current
      if (!det) return
      det.setNoiseFloorDb(newDb)
    },
    [detectorRef]
  )

  // Release noise floor drag -> return to adaptive mode
  const handleNoiseFloorDragEnd = useCallback(() => {
    const det = detectorRef.current
    if (!det) return
    det.resetNoiseFloor()
  }, [detectorRef])

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <AppHeader
        isActive={state.isActive}
        isFrozen={isFrozen}
        sampleRate={state.sampleRate}
        rmsLevel={rmsLevel}
        inputGainDb={inputGainDb}
        onInputGainChange={setInputGain}
        noiseFloorDb={state.noiseFloorDb}
        effectiveThresholdDb={state.effectiveThresholdDb}
        fftSize={state.fftSize}
        sustainMs={state.sustainMs}
        prominenceDb={state.prominenceDb}
        thresholdMode={state.thresholdMode}
        settings={settings}
        detectionHistory={detectionHistory}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
        onStart={start}
        onStop={stop}
        onToggleFreeze={toggleFreeze}
        onClearHistory={clearHistory}
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
                Analysis: {AUDIO_CONSTANTS.DEFAULT_MIN_FREQ_HZ} Hz - {AUDIO_CONSTANTS.DEFAULT_MAX_FREQ_HZ / 1000} kHz
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
              noiseFloorDb={state.noiseFloorDb}
              effectiveThresholdDb={state.effectiveThresholdDb}
              onThresholdDrag={handleThresholdDrag}
              onNoiseFloorDrag={handleNoiseFloorDrag}
              onNoiseFloorDragEnd={handleNoiseFloorDragEnd}
            />
          </div>
        </div>

        {/* Sidecar Panel */}
        <aside className="w-full lg:w-[30%] lg:min-w-[320px] lg:max-w-[420px] border-t lg:border-t-0 lg:border-l border-border bg-[#0e0e0e] flex flex-col overflow-hidden">
          {/* Header strip */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <div className="flex items-center gap-1.5">
              <Crosshair className="h-3 w-3 text-feedback-danger" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Targets
              </span>
              {feedbackDetections.length > 0 && (
                <span className="text-[9px] bg-feedback-danger/20 text-feedback-danger px-1 rounded-full font-bold">
                  {feedbackDetections.length}
                </span>
              )}
            </div>
            <span className="font-mono text-[9px] text-muted-foreground/40">
              {detectionHistory.length} total
            </span>
          </div>

          {/* Targets list */}
          <ScrollArea className="flex-1">
            <div className="p-3">
              <TelemetryPanel
                history={detectionHistory}
                onDismiss={dismissDetection}
                isActive={state.isActive}
              />
            </div>
          </ScrollArea>
        </aside>
      </main>
    </div>
  )
}
