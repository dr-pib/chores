'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import ChoreTemplateEditPanel from '@/components/ChoreTemplateEditPanel'
import { getStationChoreForPost } from '@/lib/chore-rotation'
import { isSupervisorRole } from '@/lib/roles'

interface ChoreTemplate {
  id: number
  name: string
  lifecycle: string
  due_offset_hours: number | null
  tasks: { id: number; name: string; sort_order: number }[]
}

const LIFECYCLE_LABELS: Record<string, string> = {
  forfeitable: 'Daily Reset',
  persistent: 'Persistent',
}

const HARRISON_CREWS = ['Supervisor', '24-7', '24-8', 'Swing']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ChoreTemplatesPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [templates, setTemplates] = useState<ChoreTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
const [generateDate, setGenerateDate] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  )
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<string | null>(null)
  const [markingMissed, setMarkingMissed] = useState(false)
  const [markMissedResult, setMarkMissedResult] = useState<string | null>(null)
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false)
  const [cleanDuplicatesResult, setCleanDuplicatesResult] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/chore-templates').then(r => r.json()),
    ]).then(([meData, templatesData]) => {
      if (!meData.user) { router.push('/login'); return }
      if (!isSupervisorRole(meData.user.role)) { router.push('/setup'); return }
      setUser(meData.user)
      setTemplates(Array.isArray(templatesData) ? templatesData : [])
      setLoading(false)
    })
  }, [router])

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  if (!user) return null

  function handleRowClick(id: number) {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSelectedId(id)
    } else {
      router.push(`/chore-templates/${id}`)
    }
  }

  async function handleMarkMissed() {
    setMarkingMissed(true)
    setMarkMissedResult(null)
    try {
      const res = await fetch('/api/admin/mark-missed-scheduled-work', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMarkMissedResult(data.marked === 0
          ? 'No forfeitable ScheduledWork past their lock window — nothing to transition.'
          : `Marked ${data.marked} ScheduledWork row${data.marked === 1 ? '' : 's'} as missed.`)
      } else {
        setMarkMissedResult('Error: ' + (data.error ?? 'Unknown error'))
      }
    } catch {
      setMarkMissedResult('Network error.')
    } finally {
      setMarkingMissed(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch('/api/admin/generate-scheduled-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: generateDate, end_date: generateDate }),
      })
      const data = await res.json()
      if (res.ok) {
        setGenerateResult(data.created === 0
          ? 'No new ScheduledWork rows — already up to date for this date.'
          : `Created ${data.created} ScheduledWork row${data.created === 1 ? '' : 's'} (${data.skipped} already existed).`)
      } else {
        setGenerateResult('Error: ' + (data.error ?? 'Unknown error'))
      }
    } catch {
      setGenerateResult('Network error.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCleanDuplicates() {
    setCleaningDuplicates(true)
    setCleanDuplicatesResult(null)
    try {
      const res = await fetch('/api/admin/cleanup-duplicate-logs', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const parts = []
        if (data.deleted === 0 && data.skipped === 0) {
          parts.push('No duplicate active logs found — already clean.')
        } else {
          if (data.deleted > 0) parts.push(`Removed ${data.deleted} duplicate log${data.deleted === 1 ? '' : 's'}.`)
          if (data.skipped > 0) parts.push(`Skipped ${data.skipped} log${data.skipped === 1 ? '' : 's'} with completed chores (manual review needed).`)
        }
        setCleanDuplicatesResult(parts.join(' '))
      } else {
        setCleanDuplicatesResult('Error: ' + (data.error ?? 'Unknown error'))
      }
    } catch {
      setCleanDuplicatesResult('Network error.')
    } finally {
      setCleaningDuplicates(false)
    }
  }

  async function handleBackfill() {
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await fetch('/api/admin/backfill-chores', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setBackfillResult(data.created === 0
          ? `All ${data.logs} active shifts already up to date.`
          : `Added ${data.created} missing chore${data.created === 1 ? '' : 's'} across ${data.logs} active shifts.`)
      } else {
        setBackfillResult('Error: ' + (data.error ?? 'Unknown error'))
      }
    } catch {
      setBackfillResult('Network error.')
    } finally {
      setBackfilling(false)
    }
  }

  function handleDeleted() {
    setSelectedId(null)
    fetch('/api/chore-templates').then(r => r.json()).then(data => {
      setTemplates(Array.isArray(data) ? data : [])
    })
  }

  return (
    <div className="bg-zinc-950 min-h-screen">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="lg:flex lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">

        {/* Left: list */}
        <div className="lg:w-[36rem] lg:flex-shrink-0 lg:border-r lg:border-zinc-800 lg:overflow-y-auto">
          <div className="px-4 py-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-bold text-zinc-100">Chore Templates</h1>
              <Link
                href="/chore-templates/new"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors"
              >
                + New
              </Link>
            </div>

            <div className="space-y-2 mb-8">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleRowClick(t.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-colors hover:border-zinc-700 ${
                    selectedId === t.id
                      ? 'border-blue-500/50 bg-zinc-800/80'
                      : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-100 text-sm truncate">{t.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                      t.lifecycle === 'forfeitable'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {LIFECYCLE_LABELS[t.lifecycle] ?? t.lifecycle}
                    </span>
                  </div>
                  <div className="text-zinc-500 text-xs mt-0.5 truncate">
                    {t.due_offset_hours != null && <span>Due +{t.due_offset_hours}h · </span>}
                    {t.tasks.length > 0 ? `${t.tasks.length} sub-task${t.tasks.length === 1 ? '' : 's'}` : 'No sub-tasks'}
                  </div>
                </button>
              ))}
            </div>

            {/* Harrison Rotation Grid */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Harrison Rotation
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left text-zinc-500 font-medium pb-2 pr-3">Mo</th>
                      {HARRISON_CREWS.map(crew => (
                        <th key={crew} className="text-left text-zinc-400 font-semibold pb-2 pr-3">{crew}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((month, i) => {
                      const monthNum = i + 1
                      return (
                        <tr key={month} className="border-t border-zinc-800">
                          <td className="text-zinc-500 py-1 pr-3">{month}</td>
                          {HARRISON_CREWS.map(crew => {
                            const chore = getStationChoreForPost(crew, monthNum)
                            return (
                              <td key={crew} className="py-1 pr-3 text-zinc-300">{chore ?? '—'}</td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Admin Utilities */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mt-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Admin Utilities
              </h2>
              <button
                onClick={handleBackfill}
                disabled={backfilling}
                className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm rounded-lg font-medium transition-colors text-left"
              >
                {backfilling ? 'Running…' : 'Backfill Missing Scheduled Chores'}
              </button>
              <p className="text-zinc-600 text-xs mt-1.5 leading-snug">
                Adds any missing NARC / Monthly / Quarterly Expires to all currently active shifts.
              </p>
              {backfillResult && (
                <p className="text-zinc-400 text-xs mt-2 font-medium">{backfillResult}</p>
              )}
<div className="mt-3">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={generateDate}
                    onChange={e => { setGenerateDate(e.target.value); setGenerateResult(null) }}
                    className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={generating || !generateDate}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
                  >
                    {generating ? 'Generating…' : 'Generate Work'}
                  </button>
                </div>
                <p className="text-zinc-600 text-xs mt-1.5 leading-snug">
                  Generates ScheduledWork rows (Monthly/Quarterly Expires for Units 1–11, 14, 20; NARC Expires for boxes A–L) for the selected date. Safe to re-run — duplicates are skipped.
                </p>
                {generateResult && (
                  <p className="text-zinc-400 text-xs mt-2 font-medium">{generateResult}</p>
                )}
              </div>
              <button
                onClick={handleMarkMissed}
                disabled={markingMissed}
                className="w-full mt-3 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm rounded-lg font-medium transition-colors text-left"
              >
                {markingMissed ? 'Checking…' : 'Mark Missed Forfeitable Work'}
              </button>
              <p className="text-zinc-600 text-xs mt-1.5 leading-snug">
                Transitions forfeitable ScheduledWork rows from pending to missed once their lock window has closed. Overdue (window open) is not the same as missed (window closed).
              </p>
              {markMissedResult && (
                <p className="text-zinc-400 text-xs mt-2 font-medium">{markMissedResult}</p>
              )}
              <button
                onClick={handleCleanDuplicates}
                disabled={cleaningDuplicates}
                className="w-full mt-3 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm rounded-lg font-medium transition-colors text-left"
              >
                {cleaningDuplicates ? 'Cleaning…' : 'Remove Duplicate Active Logs'}
              </button>
              <p className="text-zinc-600 text-xs mt-1.5 leading-snug">
                Removes extra active shift logs for employees who have more than one. Keeps the most recently created log per employee. Only deletes duplicates with no completed chores — logs with completed work are reported but not touched.
              </p>
              {cleanDuplicatesResult && (
                <p className="text-zinc-400 text-xs mt-2 font-medium">{cleanDuplicatesResult}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: detail panel — large screens only */}
        <div className="hidden lg:flex lg:flex-1 lg:overflow-y-auto">
          {selectedId ? (
            <ChoreTemplateEditPanel key={selectedId} templateId={selectedId} onDeleted={handleDeleted} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              Click a chore template on the left to edit.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
