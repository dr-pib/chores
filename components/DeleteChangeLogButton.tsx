'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export default function DeleteChangeLogButton({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!window.confirm('Delete this audit log entry? This cannot be undone.')) return
    startTransition(async () => {
      await fetch(`/api/change-logs/${id}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
    >
      Delete
    </button>
  )
}
