import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { PwaInstaller } from '@/components/pwa-installer'
import './globals.css'

const _inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const _jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: 'KillTheRing -- Live Sound Feedback Analyzer',
  description: 'Real-time acoustic feedback detection and elimination tool for live sound engineers. Identify problem frequencies and apply notch filters to eliminate PA system feedback.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KillTheRing',
  },
  icons: {
    icon: [
      {
        url: '/icons/icon-192x192.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
      },
      {
        url: '/icons/icon-512x512.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
      },
    ],
    apple: '/icons/icon-192x192.jpg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${_inter.variable} ${_jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <PwaInstaller />
        <Analytics />
      </body>
    </html>
  )
}
