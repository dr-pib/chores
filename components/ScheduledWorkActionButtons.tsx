'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ScheduledWorkActionButtonsProps {
  swId: number
  status: string
}

export default function ScheduledWorkActionButtons({ swId, status }: ScheduledWorkActionButtonsProps) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit() {
    if (!note.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/scheduled-work/${swId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'not_applicable', note: note.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to update')
      } else {
        setOpen(false)
        setNote('')
        router.refresh()
      }
    } catch {
      alert('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (open) {
    return (
      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <input
          autoFocus
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') { setOpen(false); setNote('') }
          }}
          placeholder="Reason (e.g. on lift, at mechanic)"
          className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 placeholder-zinc-600 w-52"
        />
        <button
          onClick={submit}
          disabled={loading || !note.trim()}
          className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
        >
          {loading ? '…' : 'Save'}
        </button>
        <button
          onClick={() => { setOpen(false); setNote('') }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 px-2 py-0.5 rounded transition-colors"
    >
      Inaccessible
    </button>
  )
}
