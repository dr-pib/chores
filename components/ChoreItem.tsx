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

function fmtTime(d: Date | string | null) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtShortDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).toUpperCase()
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
      if (res.ok) { setLocalStatus('completed'); router.refresh() }
      else if (res.status === 409 || res.status === 403) {
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
      if (res.ok) { setLocalStatus('pending'); router.refresh() }
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

  // ── Status indicator ──────────────────────────────────────────────
  const indicator = hasTasks ? null : (
    <button
      onClick={isDone ? uncomplete : isNotYetAvailable ? undefined : complete}
      disabled={isPending || isNotYetAvailable}
      aria-label={isDone ? 'Uncheck' : isNotYetAvailable ? 'Not yet available' : 'Mark complete'}
      className={`mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center border transition-colors ${
        isDone
          ? 'border-cyan-500 bg-cyan-500/80 hover:border-red-500 hover:bg-red-500/60 cursor-pointer'
          : isNotYetAvailable
          ? 'border-zinc-700 bg-transparent cursor-not-allowed'
          : 'border-zinc-600 bg-transparent hover:border-cyan-400 cursor-pointer'
      } ${isPending ? 'opacity-40' : ''}`}
    >
      {isDone && (
        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {isNotYetAvailable && (
        <svg className="w-2 h-2 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
    </button>
  )

  // Progress indicator for task-based chores
  const taskProgress = hasTasks ? (
    <div className={`mt-0.5 w-3.5 h-3.5 shrink-0 border flex items-center justify-center ${
      isDone ? 'border-cyan-500' : 'border-zinc-600'
    }`}>
      {isDone
        ? <svg className="w-2 h-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        : <span className="font-mono text-[7px] text-zinc-600">{localTasks.filter(t => t.completed_at).length}/{localTasks.length}</span>
      }
    </div>
  ) : null

  return (
    <div className={`op-row py-1.5 ${isDone || isNotYetAvailable ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2">
        {hasTasks ? taskProgress : indicator}

        <div className="flex-1 min-w-0">
          {/* Main row */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`font-mono text-xs ${isDone ? 'line-through text-zinc-600' : 'text-zinc-200'} ${isTruckCheck ? 'font-semibold' : ''}`}>
              {chore.chore_template.name}
            </span>
            {chore.unit && (
              <span className={`font-mono text-xs ${isTruckCheck ? 'text-cyan-400' : 'text-zinc-400'}`}>
                {formatUnit(chore.unit, false)}
              </span>
            )}
            {chore.chore_date && (
              <span className="font-mono text-[10px] text-zinc-600">{fmtShortDate(chore.chore_date)}</span>
            )}
            {chore.due_at && !isDone && (
              <span className="font-mono text-[10px] text-zinc-600">DUE {fmtTime(chore.due_at)}</span>
            )}
            {isPersistent && !isDone && (
              <span className="font-mono text-[9px] text-purple-500 border border-purple-800/40 px-1">PER</span>
            )}
            {isDone && chore.completed_by && (
              <span className="font-mono text-[10px] text-zinc-600">
                ✓ {chore.completed_by.name.split(' ')[0]} {fmtTime(chore.completed_at)}
              </span>
            )}
            {isNotYetAvailable && (
              <span className="font-mono text-[9px] text-zinc-700 uppercase tracking-wider">AVAIL MIDNIGHT</span>
            )}
          </div>

          {/* Conflict / error message */}
          {conflictMsg && (
            <p className="font-mono text-[10px] text-amber-500 mt-0.5">
              ⚠ {conflictMsg}{canOverride && ' — override available'}
            </p>
          )}

          {/* Sub-tasks */}
          {hasTasks && (
            <div className="mt-1 ml-0.5 space-y-0.5">
              {localTasks.map(task => {
                const taskDone = task.completed_at !== null
                return (
                  <button
                    key={task.id}
                    onClick={() => taskDone ? uncompleteTask(task.id) : completeTask(task.id)}
                    disabled={isPending}
                    className={`flex items-center gap-2 w-full text-left ${isPending ? 'opacity-40' : ''}`}
                  >
                    <span className={`w-2.5 h-2.5 shrink-0 border flex items-center justify-center transition-colors ${
                      taskDone ? 'border-cyan-600 bg-cyan-600/60' : 'border-zinc-700 hover:border-cyan-600'
                    }`}>
                      {taskDone && (
                        <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className={`font-mono text-[11px] ${taskDone ? 'line-through text-zinc-700' : 'text-zinc-400'}`}>
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
