'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatUnit } from '@/lib/units'

interface ChoreTemplate { name: string; lifecycle_type: string; due_offset_hours: number | null }
interface Unit { unit_number: number; unit_type: string; unit_name?: string | null }
interface Employee { name: string }
interface ChoreTemplateTask { id: number; name: string; sort_order: number }
interface ChoreTask {
  id: number
  chore_template_task: ChoreTemplateTask
  completed_at: Date | string | null
  completed_by: Employee | null
}
interface Chore {
  id: number
  status: string
  due_at: Date | string | null
  completed_at: Date | string | null
  completed_by: Employee | null
  chore_template: ChoreTemplate
  unit: Unit | null
  bay_label: string | null
  chore_date?: Date | string | null
  tasks?: ChoreTask[]
  [key: string]: unknown
}

function formatTime(d: Date | string | null) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatShortDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
}

export default function ChoreItem({ chore, userRole }: { chore: Chore; userRole: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState(chore.status)
  const [localTasks, setLocalTasks] = useState<ChoreTask[]>(chore.tasks ?? [])
  const [conflictMsg, setConflictMsg] = useState('')

  const canOverride = ['Dom', 'Admin', 'Supervisor'].includes(userRole)

  const hasTasks = localTasks.length > 0
  const isDone = localStatus === 'completed'
  const isPersistent = chore.chore_template.lifecycle_type === 'persistent_until_complete'
  const isTruckCheck = chore.chore_template.name === 'Truck Check'

  const isNotYetAvailable = !isDone
    && chore.chore_template.lifecycle_type === 'daily_reset'
    && chore.chore_date != null
    && new Date() < new Date(chore.chore_date)

  async function complete() {
    setConflictMsg('')
    startTransition(async () => {
      const res = await fetch(`/api/chores/${chore.id}/complete`, { method: 'POST' })
      if (res.ok) {
        setLocalStatus('completed')
        router.refresh()
      } else if (res.status === 409 || res.status === 403) {
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

  async function completeTask(taskId: number) {
    startTransition(async () => {
      const res = await fetch(`/api/chore-tasks/${taskId}/complete`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const now = new Date().toISOString()
        setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed_at: now } : t))
        if (data.parentCompleted) setLocalStatus('completed')
        router.refresh()
      }
    })
  }

  async function uncompleteTask(taskId: number) {
    startTransition(async () => {
      const res = await fetch(`/api/chore-tasks/${taskId}/uncomplete`, { method: 'POST' })
      if (res.ok) {
        setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed_at: null } : t))
        setLocalStatus('pending')
        router.refresh()
      }
    })
  }

  return (
    <div className={`py-2 rounded-lg ${isDone || isNotYetAvailable ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Status icon — only shown when there are no sub-tasks */}
        {!hasTasks && (
          <button
            onClick={isDone ? uncomplete : isNotYetAvailable ? undefined : complete}
            disabled={isPending || isNotYetAvailable}
            aria-label={isDone ? 'Uncheck task' : isNotYetAvailable ? 'Not yet available' : 'Mark complete'}
            className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
              isDone
                ? 'border-green-500 bg-green-500 hover:border-red-400 hover:bg-red-500 cursor-pointer'
                : isNotYetAvailable
                ? 'border-zinc-700 bg-zinc-800 cursor-not-allowed'
                : 'border-zinc-600 hover:border-blue-400 cursor-pointer'
            } ${isPending ? 'opacity-50' : ''}`}
          >
            {isDone && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {isNotYetAvailable && (
              <svg className="w-3 h-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isDone ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
              {chore.chore_template.name}
            </span>
            {isTruckCheck && chore.unit && (
              <span className="text-sm font-semibold text-blue-300">{formatUnit(chore.unit, false)}</span>
            )}
            {!isTruckCheck && chore.unit && (
              <span className="text-xs text-blue-400">{formatUnit(chore.unit, false)}</span>
            )}
            {isPersistent && !isDone && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">persistent</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {chore.chore_date && (
              <span className={`text-xs font-medium ${isDone ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {formatShortDate(chore.chore_date)}
              </span>
            )}
            {chore.due_at && !isDone && (
              <span className="text-xs text-zinc-500">Due {formatTime(chore.due_at)}</span>
            )}
            {isDone && chore.completed_by && (
              <span className="text-xs text-zinc-500">
                Done by {chore.completed_by.name} at {formatTime(chore.completed_at)}
              </span>
            )}
          </div>
          {isNotYetAvailable && !hasTasks && (
            <p className="text-xs text-zinc-600 mt-0.5">Available at midnight</p>
          )}
          {conflictMsg && (
            <p className="text-xs text-yellow-400 mt-1">{conflictMsg}{canOverride && ' (you can still mark as done)'}</p>
          )}

          {/* Sub-tasks */}
          {hasTasks && (
            <div className="mt-2 space-y-1.5 ml-1">
              {localTasks.map(task => {
                const taskDone = task.completed_at !== null
                return (
                  <button
                    key={task.id}
                    onClick={() => taskDone ? uncompleteTask(task.id) : completeTask(task.id)}
                    disabled={isPending}
                    className={`flex items-center gap-2 w-full text-left group ${isPending ? 'opacity-50' : ''}`}
                  >
                    <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                      taskDone
                        ? 'border-green-500 bg-green-500'
                        : 'border-zinc-600 group-hover:border-blue-400'
                    }`}>
                      {taskDone && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-xs ${taskDone ? 'line-through text-zinc-600' : 'text-zinc-300'}`}>
                      {task.chore_template_task.name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
