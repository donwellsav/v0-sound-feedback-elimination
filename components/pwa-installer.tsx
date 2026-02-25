"use client"
import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Download, X, Wifi, WifiOff } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PwaInstaller() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("SW registration failed:", err))
    }

    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true)
    }
  }, [])

  // Listen for the install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      // Show install banner after a short delay (don't interrupt immediately)
      if (!isInstalled) {
        setTimeout(() => setShowBanner(true), 3000)
      }
    }
    window.addEventListener("beforeinstallprompt", handler)

    const installedHandler = () => {
      setIsInstalled(true)
      setShowBanner(false)
    }
    window.addEventListener("appinstalled", installedHandler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", installedHandler)
    }
  }, [isInstalled])

  // Online/offline status
  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    setIsOffline(!navigator.onLine)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === "accepted") {
      setIsInstalled(true)
    }
    setInstallPrompt(null)
    setShowBanner(false)
  }, [installPrompt])

  return (
    <>
      {/* Offline indicator */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-feedback-warning/90 text-background px-4 py-1.5 text-center">
          <div className="flex items-center justify-center gap-2">
            <WifiOff className="h-3.5 w-3.5" />
            <span className="font-mono text-xs font-bold tracking-wide">OFFLINE MODE</span>
            <WifiOff className="h-3.5 w-3.5" />
          </div>
        </div>
      )}

      {/* Install banner */}
      {showBanner && !isInstalled && (
        <div className="fixed bottom-4 left-4 right-4 z-[100] md:left-auto md:right-4 md:max-w-sm">
          <div className="rounded-lg border border-primary/30 bg-card p-4 shadow-lg shadow-primary/10">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-foreground">
                  Install KillTheRing
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Install as a standalone app for offline use. Works without internet at live venues.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={handleInstall}
                    className="gap-1.5 font-mono text-xs h-7"
                  >
                    <Download className="h-3 w-3" />
                    Install App
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBanner(false)}
                    className="text-xs h-7 text-muted-foreground"
                  >
                    Later
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground"
                onClick={() => setShowBanner(false)}
                aria-label="Dismiss install banner"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
