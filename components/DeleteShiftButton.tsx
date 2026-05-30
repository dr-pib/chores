'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROSTER_ACTION_CLASS } from '@/lib/ui'

export default function DeleteShiftButton({ logId }: { logId: number }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const res = await fetch(`/api/operations-logs/${logId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/log')
    } else {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Delete this shift?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs px-2.5 py-1 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`${ROSTER_ACTION_CLASS} bg-red-500/20 text-red-400 hover:bg-red-500/30`}
    >
      Delete
    </button>
  )
}
