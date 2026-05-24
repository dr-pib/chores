'use client'

import { useState, useEffect, useTransition } from 'react'

interface ChoreTemplateTask { id: number; name: string; sort_order: number }
interface ChoreTemplate {
  id: number
  name: string
  lifecycle_type: string
  due_offset_hours: number | null
  tasks: ChoreTemplateTask[]
}

const LIFECYCLE_OPTIONS = [
  { value: 'daily_reset', label: 'Daily Reset' },
  { value: 'persistent_until_complete', label: 'Persistent Until Complete' },
]

export default function ChoreTemplateEditPanel({
  templateId,
  onDeleted,
}: {
  templateId: number
  onDeleted?: () => void
}) {
  const [template, setTemplate] = useState<ChoreTemplate | null>(null)
  const [name, setName] = useState('')
  const [lifecycle, setLifecycle] = useState('daily_reset')
  const [dueOffset, setDueOffset] = useState('')
  const [tasks, setTasks] = useState<ChoreTemplateTask[]>([])
  const [newTaskName, setNewTaskName] = useState('')
  const [error, setError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError('')
    setSaveSuccess(false)
    fetch(`/api/chore-templates/${templateId}`)
      .then(r => r.json())
      .then((data: ChoreTemplate) => {
        setTemplate(data)
        setName(data.name)
        setLifecycle(data.lifecycle_type)
        setDueOffset(data.due_offset_hours != null ? String(data.due_offset_hours) : '')
        setTasks(data.tasks)
        setLoading(false)
      })
  }, [templateId])

  function save() {
    setError('')
    setSaveSuccess(false)
    if (!name.trim()) { setError('Name is required'); return }
    startTransition(async () => {
      const res = await fetch(`/api/chore-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          lifecycle_type: lifecycle,
          due_offset_hours: dueOffset !== '' ? Number(dueOffset) : null,
        }),
      })
      if (res.ok) {
        setSaveSuccess(true)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Save failed')
      }
    })
  }

  function addTask() {
    if (!newTaskName.trim()) return
    startTransition(async () => {
      const res = await fetch(`/api/chore-templates/${templateId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTaskName.trim() }),
      })
      if (res.ok) {
        const task: ChoreTemplateTask = await res.json()
        setTasks(prev => [...prev, task])
        setNewTaskName('')
      }
    })
  }

  function removeTask(taskId: number) {
    if (!window.confirm('Remove this sub-task? This will also delete it from any existing chores.')) return
    startTransition(async () => {
      const res = await fetch(`/api/chore-template-tasks/${taskId}`, { method: 'DELETE' })
      if (res.ok) setTasks(prev => prev.filter(t => t.id !== taskId))
    })
  }

  function renameTask(taskId: number, newName: string) {
    startTransition(async () => {
      await fetch(`/api/chore-template-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
    })
  }

  function deleteTemplate() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const res = await fetch(`/api/chore-templates/${templateId}`, { method: 'DELETE' })
      if (res.ok) onDeleted?.()
    })
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Loading…</div>
  }
  if (!template) {
    return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Template not found.</div>
  }

  return (
    <div className="flex-1 px-6 py-6 max-w-2xl space-y-5">
      <div className="mb-1">
        <h2 className="text-xl font-bold text-zinc-100">{template.name}</h2>
      </div>

      {/* Template fields */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Template</h3>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
            placeholder="e.g. Bathroom"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Lifecycle Type</label>
          <select
            value={lifecycle}
            onChange={e => setLifecycle(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
          >
            {LIFECYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-xs text-zinc-600 mt-1">
            {lifecycle === 'daily_reset'
              ? 'Resets each shift day. Locked after 2 AM CDT the next day.'
              : 'Stays visible until completed. Carries over between shifts.'}
          </p>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Due offset (hours after shift start) — optional</label>
          <input
            type="number"
            value={dueOffset}
            onChange={e => setDueOffset(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
            placeholder="e.g. 1"
            min="0"
            step="0.5"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {saveSuccess && <p className="text-xs text-green-400">Changes saved.</p>}

        <button
          onClick={save}
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Sub-tasks */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Sub-Tasks</h3>
        <p className="text-xs text-zinc-600">
          Each sub-task is checked off individually. The chore auto-completes when all sub-tasks are done. Leave empty for a simple checkbox.
        </p>

        {tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map((task, i) => (
              <div key={task.id} className="flex items-center gap-2">
                <span className="text-zinc-600 text-xs w-5 text-right">{i + 1}.</span>
                <input
                  type="text"
                  defaultValue={task.name}
                  onBlur={e => {
                    const val = e.target.value.trim()
                    if (val && val !== task.name) renameTask(task.id, val)
                  }}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => removeTask(task.id)}
                  disabled={isPending}
                  className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                  aria-label="Remove sub-task"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-600 italic">No sub-tasks yet.</p>
        )}

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={newTaskName}
            onChange={e => setNewTaskName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Sub-task name"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={addTask}
            disabled={isPending || !newTaskName.trim()}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-100 text-sm rounded-lg font-medium transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Danger zone */}
      {template.name !== 'Truck Check' && (
        <div className="bg-zinc-900 border border-red-500/30 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">Danger Zone</h3>
          <button
            onClick={deleteTemplate}
            disabled={isPending}
            className="px-3 py-1.5 border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 text-sm rounded-lg transition-colors"
          >
            Delete Template
          </button>
        </div>
      )}
    </div>
  )
}
