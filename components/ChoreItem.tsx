'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatUnit } from '@/lib/units'
import { formatEmployeeTitle } from '@/lib/employees'

interface ChoreTemplate { name: string; lifecycle_type: string; due_offset_hours: number | null }
interface Unit { unit_number: number; unit_type: string; unit_name?: string | null }
interface Employee { name: string; licensure_level?: string | null }
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
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
}

function formatDue(d: Date | string | null) {
  if (!d) return ''
  const dt = new Date(d)
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Chicago',
  }).formatToParts(dt)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  let hour = get('hour')
  if (hour === '24') hour = '00'
  return `Due ${get('weekday')}, ${get('month')}/${get('day')} ${hour}${get('minute')}`
}

export default function ChoreItem({ chore, userRole, isPastShift = false, completedElsewhere = false }: { chore: Chore; userRole: string; isPastShift?: boolean; completedElsewhere?: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState(chore.status)
  const [localTasks, setLocalTasks] = useState<ChoreTask[]>(chore.tasks ?? [])
  const [conflictMsg, setConflictMsg] = useState('')

  const canOverride = ['Dom', 'Admin', 'Supervisor'].includes(userRole)
  const isSupervisor = ['Dom', 'Admin', 'Supervisor'].includes(userRole)

  const hasTasks = localTasks.length > 0
  const isDone = localStatus === 'completed'
  const isEffectivelyDone = isDone || completedElsewhere
  const isTruckCheck = chore.chore_template.name === 'Truck Check'
  const isExpireChore = ['Monthly Expires', 'Quarterly Expires', 'NARC Expires'].includes(chore.chore_template.name)
  const isOverdue = !isEffectivelyDone && chore.due_at != null && new Date(chore.due_at).getTime() < Date.now()
  const choreTitleClass = isEffectivelyDone
    ? 'line-through text-zinc-500'
    : isOverdue
      ? 'text-red-300'
      : isExpireChore
        ? 'text-amber-300'
        : 'text-zinc-100'

  function chicagoMidnight(d: Date): Date {
    for (const h of [5, 6]) {
      const candidate = new Date(d.getTime() + h * 3600 * 1000)
      const hhmm = candidate.toLocaleString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'America/Chicago',
      })
      if (hhmm.startsWith('00:')) return candidate
    }
    return new Date(d.getTime() + 5 * 3600 * 1000)
  }

  const isNotYetAvailable = !isDone
    && chore.chore_template.lifecycle_type === 'daily_reset'
    && chore.chore_date != null
    && new Date() < chicagoMidnight(new Date(chore.chore_date))

  async function complete() {
    if (isPastShift) {
      if (!isSupervisor) return
      if (!window.confirm("You're editing a past shift. This changes the historical chore record. Continue?")) return
    }
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
    if (isPastShift) {
      if (!isSupervisor) return
      if (!window.confirm("You're editing a past shift. This changes the historical chore record. Continue?")) return
    } else {
      if (!window.confirm('Uncheck this task?')) return
    }
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
    <div className={`py-2 rounded-lg ${isEffectivelyDone || isNotYetAvailable ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Status icon — only shown when there are no sub-tasks */}
        {!hasTasks && (
          <button
            onClick={isEffectivelyDone ? (completedElsewhere ? undefined : uncomplete) : isNotYetAvailable ? undefined : complete}
            disabled={isPending || completedElsewhere || isNotYetAvailable || (isPastShift && !isSupervisor)}
            aria-label={isEffectivelyDone ? 'Done' : isNotYetAvailable ? 'Not yet available' : 'Mark complete'}
            className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
              isEffectivelyDone
                ? isDone
                  ? 'border-green-500 bg-green-500 hover:border-red-400 hover:bg-red-500 cursor-pointer'
                  : 'border-green-500 bg-green-500 cursor-default'
                : isNotYetAvailable
                ? 'border-zinc-700 bg-zinc-800 cursor-not-allowed'
                : 'border-zinc-600 hover:border-blue-400 cursor-pointer'
            } ${isPending ? 'opacity-50' : ''}`}
          >
            {isEffectivelyDone && (
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
            <span className={`text-sm font-medium ${choreTitleClass}`}>
              {chore.chore_template.name}
            </span>
            {isTruckCheck && chore.unit && (
              <span className="text-sm font-semibold text-blue-300">{formatUnit(chore.unit, false)}</span>
            )}
            {!isTruckCheck && chore.unit && (
              <span className="text-xs text-blue-400">{formatUnit(chore.unit, false)}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {chore.due_at && !isEffectivelyDone && (
              <span className="text-xs text-zinc-500">{formatDue(chore.due_at)}</span>
            )}
            {isDone && chore.completed_by && (
              <span className="text-xs text-zinc-500">
                Done by {formatEmployeeTitle(chore.completed_by)} at {formatTime(chore.completed_at)}
              </span>
            )}
            {completedElsewhere && (
              <span className="text-xs text-zinc-500">Completed by another crew</span>
            )}
          </div>
          {isNotYetAvailable && (
            <p className="text-xs text-zinc-600 mt-0.5">Available at midnight</p>
          )}
          {!completedElsewhere && conflictMsg && (
            <p className="text-xs text-yellow-400 mt-1">{conflictMsg}{canOverride && ' (you can still mark as done)'}</p>
          )}

          {/* Sub-tasks */}
          {hasTasks && !isNotYetAvailable && (
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
