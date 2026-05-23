'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function ConfirmShiftButton({ logId, confirmed }: { logId: number; confirmed: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isConfirmed, setIsConfirmed] = useState(confirmed)

  function toggle() {
    startTransition(async () => {
      const method = isConfirmed ? 'DELETE' : 'POST'
      const res = await fetch(`/api/operations-logs/${logId}/confirm`, { method })
      if (res.ok) {
        setIsConfirmed(!isConfirmed)
        router.refresh()
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`op-btn font-mono text-[9px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
        isConfirmed
          ? 'text-cyan-400 border border-cyan-800/50 hover:text-red-400 hover:border-red-800/50'
          : 'text-zinc-500 border border-zinc-700 hover:text-cyan-400 hover:border-cyan-800/50'
      }`}
    >
      {isPending ? '…' : isConfirmed ? 'CONFIRMED' : 'CONFIRM'}
    </button>
  )
}
