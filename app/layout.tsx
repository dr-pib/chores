import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EMS Station Chores',
  description: 'EMS station chore tracking, truck checks, and crew roster management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  )
}
