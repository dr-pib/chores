'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface ChoreTemplate { name: string; lifecycle_type: string; due_offset_hours: number | null }
interface Unit { unit_number: number; unit_type: string }
interface Employee { name: string }
interface Chore {
  id: number
  status: string
  due_at: Date | string | null
  completed_at: Date | string | null
  completed_by: Employee | null
  chore_template: ChoreTemplate
  unit: Unit | null
  bay_label: string | null
  [key: string]: unknown
}

function formatTime(d: Date | string | null) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function ChoreItem({ chore, userRole }: { chore: Chore; userRole: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState(chore.status)
  const [conflictMsg, setConflictMsg] = useState('')

  const canOverride = ['Dom', 'Admin', 'Supervisor'].includes(userRole)

  async function complete() {
    setConflictMsg('')
    startTransition(async () => {
      const res = await fetch(`/api/chores/${chore.id}/complete`, { method: 'POST' })
      if (res.ok) {
        setLocalStatus('completed')
        router.refresh()
      } else if (res.status === 409) {
        const data = await res.json()
        setConflictMsg(data.error)
      }
    })
  }

  async function uncomplete() {
    if (!window.confirm('Uncheck this task?')) return
    setConflictMsg('')
    startTransition(async () => {
      const res = await fetch(`/api/chores/${chore.id}/uncomplete`, { method: 'POST' })
      if (res.ok) {
        setLocalStatus('pending')
        router.refresh()
      }
    })
  }

  const isDone = localStatus === 'completed'
  const isPersistent = chore.chore_template.lifecycle_type === 'persistent_until_complete'

  return (
    <div className={`flex items-start gap-3 py-2 rounded-lg ${isDone ? 'opacity-60' : ''}`}>
      {/* Status icon */}
      <button
        onClick={isDone ? uncomplete : complete}
        disabled={isPending}
        aria-label={isDone ? 'Uncheck task' : 'Mark complete'}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
          isDone
            ? 'border-green-500 bg-green-500 hover:border-red-400 hover:bg-red-500 cursor-pointer'
            : 'border-zinc-600 hover:border-blue-400 cursor-pointer'
        } ${isPending ? 'opacity-50' : ''}`}
      >
        {isDone && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${isDone ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
            {chore.chore_template.name}
          </span>
          {chore.unit && (
            <span className="text-xs text-blue-400">Unit {chore.unit.unit_number}</span>
          )}
          {isPersistent && !isDone && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">persistent</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {chore.due_at && !isDone && (
            <span className="text-xs text-zinc-500">Due {formatTime(chore.due_at)}</span>
          )}
          {isDone && chore.completed_by && (
            <span className="text-xs text-zinc-500">
              Done by {chore.completed_by.name} at {formatTime(chore.completed_at)}
            </span>
          )}
        </div>
        {conflictMsg && (
          <p className="text-xs text-yellow-400 mt-1">{conflictMsg}{canOverride && ' (you can still mark as done)'}</p>
        )}
      </div>
    </div>
  )
}
