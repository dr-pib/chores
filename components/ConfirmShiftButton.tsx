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
      className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
        isConfirmed
          ? 'bg-green-500/20 text-green-400 hover:bg-red-500/20 hover:text-red-400'
          : 'bg-yellow-500/20 text-yellow-400 hover:bg-green-500/20 hover:text-green-400'
      }`}
    >
      {isPending ? '…' : isConfirmed ? 'Confirmed' : 'Confirm'}
    </button>
  )
}
