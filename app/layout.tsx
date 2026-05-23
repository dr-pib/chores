import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jb-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EMS Station Chores',
  description: 'EMS station chore tracking, truck checks, and crew roster management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${jetBrainsMono.variable}`}>
      <body className="min-h-full bg-[#09090b] text-[#d4d8e0] antialiased">{children}</body>
    </html>
  )
}
