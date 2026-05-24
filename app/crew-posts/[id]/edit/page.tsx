'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { BAY_OPTIONS } from '@/lib/bays'
import { formatUnit } from '@/lib/units'

interface Unit { id: number; unit_number: number; unit_type: string; unit_name: string | null }

interface CrewPost {
  id: number
  name: string
  default_start_time: string
  station: { id: number; name: string }
  default_unit: Unit | null
  default_unit_id: number | null
  bays: { id: number; bay_label: string; unit_id: number | null; unit: Unit | null; sort_order: number }[]
}

interface BayRow { bay_label: string; unit_id: number | null; sort_order: number }

const inputClass = 'px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
const labelClass = 'block text-sm text-zinc-300 mb-1.5'

export default function EditCrewPostPage() {
  const router = useRouter()
  const params = useParams()
  const postId = params.id as string

  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [post, setPost] = useState<CrewPost | null>(null)
  const [units, setUnits] = useState<Unit[]>([])

  const [startTime, setStartTime] = useState('')
  const [defaultUnitId, setDefaultUnitId] = useState<number | ''>('')
  const [bays, setBays] = useState<BayRow[]>([])

  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch(`/api/crew-posts/${postId}`).then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
    ]).then(([meData, postData, unitsData]) => {
      if (!meData.user) { router.push('/login'); return }
      if (!['Dom', 'Admin', 'Supervisor'].includes(meData.user.role)) { router.push('/setup'); return }
      if (postData.error) { router.push('/crew-posts'); return }

      setCurrentUser(meData.user)
      setPost(postData)
      setUnits(Array.isArray(unitsData) ? unitsData : [])

      setStartTime(postData.default_start_time)
      setDefaultUnitId(postData.default_unit_id ?? '')
      setBays(
        postData.bays.length > 0
          ? postData.bays.map((b: { bay_label: string; unit_id: number | null; sort_order: number }) => ({
              bay_label: b.bay_label,
              unit_id: b.unit_id ?? null,
              sort_order: b.sort_order,
            }))
          : [{ bay_label: '', unit_id: null, sort_order: 1 }]
      )
    })
  }, [postId, router])

  function addBay() {
    setBays(prev => [...prev, { bay_label: '', unit_id: null, sort_order: prev.length + 1 }])
  }

  function removeBay(index: number) {
    setBays(prev => prev.filter((_, i) => i !== index).map((b, i) => ({ ...b, sort_order: i + 1 })))
  }

  function updateBay(index: number, field: 'bay_label' | 'unit_id', value: string | number | null) {
    setBays(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
  }

  const usedLabels = (currentIndex: number) =>
    bays.filter((_, i) => i !== currentIndex).map(b => b.bay_label).filter(Boolean)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!startTime) { setError('Start time is required'); return }
    const emptyBay = bays.find(b => !b.bay_label)
    if (emptyBay) { setError('Select a bay label for each row, or remove empty rows'); return }
    const dupBay = bays.find((b, i) => usedLabels(i).includes(b.bay_label))
    if (dupBay) { setError(`Bay ${dupBay.bay_label} is listed more than once`); return }

    setError('')
    setSuccess(false)
    startTransition(async () => {
      const res = await fetch(`/api/crew-posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_start_time: startTime,
          default_unit_id: defaultUnitId || null,
          bays,
        }),
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to save changes')
      }
    })
  }

  if (!currentUser || !post) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={currentUser.name} userRole={currentUser.role} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.push('/crew-posts')}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Back to shift profiles"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{post.name}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{post.station.name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Schedule defaults */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
            <h2 className="text-base font-semibold text-zinc-100 mb-1">Schedule defaults</h2>
            <p className="text-sm text-zinc-500 mb-4">Pre-filled on Shift Setup when this shift profile is selected.</p>
            <div>
              <label htmlFor="start-time" className={labelClass}>Default start time</label>
              <input
                id="start-time"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Default truck */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
            <h2 className="text-base font-semibold text-zinc-100 mb-1">Primary truck</h2>
            <p className="text-sm text-zinc-500 mb-4">The unit most commonly associated with this shift profile (used for display).</p>
            <select
              value={defaultUnitId}
              onChange={e => setDefaultUnitId(e.target.value ? Number(e.target.value) : '')}
              className={inputClass}
            >
              <option value="">No primary truck</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>{formatUnit(u)}</option>
              ))}
            </select>
          </div>

          {/* Default bays */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Typical bays</h2>
                <p className="mt-1 text-sm text-zinc-500">Set the bay and the usual truck parked there. Leave the truck blank if it varies shift to shift.</p>
              </div>
              <button
                type="button"
                onClick={addBay}
                className="shrink-0 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
              >
                + Add bay
              </button>
            </div>

            {bays.length === 0 && (
              <p className="rounded-lg border border-dashed border-zinc-700 px-4 py-5 text-center text-sm text-zinc-500">
                No default bays. Add one above.
              </p>
            )}

            {bays.length > 0 && (
              <div className="hidden sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_1.5rem] gap-2 pb-1">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Bay</span>
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Default truck</span>
              </div>
            )}

            <div className="space-y-2">
              {bays.map((bay, i) => {
                const isDup = usedLabels(i).includes(bay.bay_label) && bay.bay_label !== ''
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_1.5rem] sm:items-center rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 sm:hidden">Bay</label>
                      <select
                        value={bay.bay_label}
                        onChange={e => updateBay(i, 'bay_label', e.target.value)}
                        className={`w-full ${inputClass} ${isDup ? 'border-yellow-600' : ''}`}
                        aria-label={`Bay ${i + 1}`}
                      >
                        <option value="">Select bay…</option>
                        {BAY_OPTIONS.map(b => (
                          <option key={b} value={b}>Bay {b}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 sm:hidden">Default truck</label>
                      <select
                        value={bay.unit_id ?? ''}
                        onChange={e => updateBay(i, 'unit_id', e.target.value ? Number(e.target.value) : null)}
                        className={`w-full ${inputClass}`}
                        aria-label="Default truck for bay"
                      >
                        <option value="">Varies / unknown</option>
                        {units.map(u => (
                          <option key={u.id} value={u.id}>{formatUnit(u)}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBay(i)}
                      className="justify-self-end rounded p-1 text-zinc-600 transition-colors hover:text-red-400"
                      aria-label="Remove bay"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
            {bays.some((b, i) => usedLabels(i).includes(b.bay_label) && b.bay_label !== '') && (
              <p className="mt-2 text-yellow-400 text-xs">Duplicate bay — each bay can only appear once.</p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-green-400 text-sm">Changes saved.</div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/crew-posts')}
              className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
