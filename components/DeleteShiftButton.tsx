'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
        <span className="font-mono text-[9px] uppercase tracking-wide text-zinc-500">DELETE?</span>
        <button onClick={handleDelete} disabled={loading} className="op-btn op-btn-danger">
          {loading ? '…' : 'YES'}
        </button>
        <button onClick={() => setConfirming(false)} className="op-btn op-btn-ghost">NO</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="font-mono text-[9px] uppercase tracking-wider text-zinc-700 hover:text-red-500 transition-colors"
    >
      DELETE SHIFT
    </button>
  )
}
