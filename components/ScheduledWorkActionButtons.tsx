'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ScheduledWorkActionButtonsProps {
  swId: number
  status: string
}

export default function ScheduledWorkActionButtons({ swId, status }: ScheduledWorkActionButtonsProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleAction = async (action: 'complete' | 'not_applicable') => {
    let note = ''
    if (action === 'not_applicable') {
      note = window.prompt('Enter a reason for marking this as N/A (e.g., At mechanic, Unit OOS):') || ''
      if (!note) return // Cancelled or empty
    } else {
      if (!window.confirm(`Mark this work as completed?`)) return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/scheduled-work/${swId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to update scheduled work')
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to resolve scheduled work:', err)
      alert('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 ml-auto">
      {status === 'pending' && (
        <button
          onClick={() => handleAction('complete')}
          disabled={loading}
          className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 px-2 py-1 rounded transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'Complete'}
        </button>
      )}
      <button
        onClick={() => handleAction('not_applicable')}
        disabled={loading}
        className="text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
      >
        {loading ? '...' : 'N/A'}
      </button>
    </div>
  )
}
