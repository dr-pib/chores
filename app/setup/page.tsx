'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { BAY_OPTIONS } from '@/lib/bays'
import { formatUnit } from '@/lib/units'

interface Unit { id: number; unit_number: number; unit_type: string; unit_name?: string | null }
interface CrewPostBay { id: number; bay_label: string; sort_order: number }
interface CrewPost {
  id: number; name: string; default_start_time: string; default_shift_length_hours: number
  station: { id: number; name: string }; default_unit: Unit | null; bays: CrewPostBay[]
}
interface Employee { id: number; name: string; email_username: string; licensure_level: string; role: string; default_crew_post_id: number | null }
interface PrevBay { bay_label: string; unit_id: number | null; unit_status: string; unit: Unit | null }

interface BayState {
  bay_label: string
  unit_id: number | null
  unit_status: 'unit_present' | 'empty_bay' | 'unit_at_shop'
  sort_order: number
}

const inputClass = 'px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'

function formatLocalDatetime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildDefaultStart(post: CrewPost, baseDate: Date): Date {
  const [h, m] = post.default_start_time.split(':').map(Number)
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m)
}

function makeEmptyBay(sortOrder: number, defaultUnitId: number | null = null): BayState {
  return { bay_label: '', unit_id: defaultUnitId, unit_status: 'unit_present', sort_order: sortOrder }
}

export default function SetupPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [user, setUser] = useState<{ id: number; name: string; role: string; default_shift_length_hours: number; default_crew_post_id: number | null } | null>(null)
  const [crewPosts, setCrewPosts] = useState<CrewPost[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [units, setUnits] = useState<Unit[]>([])

  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [startDt, setStartDt] = useState('')
  const [endDt, setEndDt] = useState('')
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [bays, setBays] = useState<BayState[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/crew-posts').then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
    ]).then(([meData, postsData, empsData, unitsData]) => {
      if (!meData.user) { router.push('/login'); return }
      setUser(meData.user)
      setCrewPosts(postsData)
      setEmployees(empsData)
      setUnits(unitsData)

      const defaultPostId = meData.user.default_crew_post_id ?? postsData[0]?.id
      if (defaultPostId) {
        setSelectedPostId(defaultPostId)
        const post = postsData.find((p: CrewPost) => p.id === defaultPostId)
        if (post) initPostDefaults(post, meData.user.default_shift_length_hours ?? 24)
      }

      if (meData.user.default_partner_id) setPartnerId(meData.user.default_partner_id)
    })
  }, [])

  function initPostDefaults(post: CrewPost, shiftHours: number) {
    const now = new Date()
    const start = buildDefaultStart(post, now)
    const end = new Date(start.getTime() + shiftHours * 60 * 60 * 1000)
    setStartDt(formatLocalDatetime(start))
    setEndDt(formatLocalDatetime(end))
    // One bay row per crew post default bay; bay_label blank until user picks
    const defaultBays = post.bays.length > 0
      ? post.bays.map((b, i) => ({
          bay_label: BAY_OPTIONS.includes(b.bay_label) ? b.bay_label : '',
          unit_id: post.default_unit?.id ?? null,
          unit_status: 'unit_present' as const,
          sort_order: i + 1,
        }))
      : [makeEmptyBay(1, post.default_unit?.id ?? null)]
    setBays(defaultBays)
  }

  async function handlePostChange(postId: number) {
    setSelectedPostId(postId)
    const post = crewPosts.find(p => p.id === postId)
    if (!post || !user) return
    initPostDefaults(post, user.default_shift_length_hours ?? 24)

    const res = await fetch(`/api/operations-logs/previous-bay?crew_post_id=${postId}`)
    const { bays: prevBays } = await res.json() as { bays: PrevBay[] }
    if (prevBays && prevBays.length > 0) {
      setBays(prevBays.map((pb, i) => ({
        bay_label: pb.bay_label,
        unit_id: pb.unit_id,
        unit_status: (pb.unit_status as BayState['unit_status']) ?? 'unit_present',
        sort_order: i + 1,
      })))
    }
  }

  function updateBay(index: number, field: keyof BayState, value: string | number | null) {
    setBays(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
  }

  function addBay() {
    setBays(prev => [...prev, makeEmptyBay(prev.length + 1)])
  }

  function removeBay(index: number) {
    setBays(prev => prev.filter((_, i) => i !== index).map((b, i) => ({ ...b, sort_order: i + 1 })))
  }

  // Bays already used in other rows (to flag duplicates)
  const usedBays = (currentIndex: number) =>
    bays.filter((_, i) => i !== currentIndex).map(b => b.bay_label).filter(Boolean)

  const selectedPost = crewPosts.find(p => p.id === selectedPostId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPostId || !startDt || !endDt) { setError('Please fill all required fields'); return }

    const unnamedBay = bays.find(b => !b.bay_label)
    if (unnamedBay) { setError('Select a bay for each row, or remove empty rows'); return }

    const dupBay = bays.find((b, i) => usedBays(i).includes(b.bay_label))
    if (dupBay) { setError(`Bay ${dupBay.bay_label} is listed more than once`); return }

    const primaryUnit = bays.find(b => b.unit_status === 'unit_present')?.unit_id
    if (!primaryUnit) { setError('At least one bay must have a unit present'); return }

    setError('')
    startTransition(async () => {
      const res = await fetch('/api/operations-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crew_post_id: selectedPostId,
          partner_employee_id: partnerId || null,
          primary_unit_id: primaryUnit,
          actual_start: new Date(startDt).toISOString(),
          actual_end: new Date(endDt).toISOString(),
          bays,
        }),
      })
      if (res.ok) {
        const log = await res.json()
        router.push(`/log/${log.id}`)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to set shift')
      }
    })
  }

  if (!user) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-zinc-100 mb-6">Shift Setup</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Post & schedule */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Crew &amp; Schedule</h2>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">Crew</label>
              <select
                value={selectedPostId ?? ''}
                onChange={(e) => handlePostChange(Number(e.target.value))}
                className={`w-full ${inputClass}`}
              >
                <option value="">Select crew…</option>
                {crewPosts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.station.name}</option>
                ))}
              </select>
            </div>

            {selectedPost && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">Start</label>
                  <input type="datetime-local" value={startDt} onChange={e => setStartDt(e.target.value)} className={`w-full ${inputClass}`} />
                </div>
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">End</label>
                  <input type="datetime-local" value={endDt} onChange={e => setEndDt(e.target.value)} className={`w-full ${inputClass}`} />
                </div>
              </div>
            )}
          </div>

          {/* Partner */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <label className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">Partner</label>
            <select
              value={partnerId}
              onChange={e => setPartnerId(e.target.value === '' ? '' : Number(e.target.value))}
              className={`w-full ${inputClass}`}
            >
              <option value="">No partner / solo</option>
              {employees.filter(e => e.id !== user.id).map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.licensure_level})</option>
              ))}
            </select>
          </div>

          {/* Trucks */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Trucks</h2>
              <button
                type="button"
                onClick={addBay}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
              >
                + Add truck
              </button>
            </div>

            {bays.length === 0 && (
              <p className="text-zinc-500 text-sm">No trucks added. Click "+ Add truck" to start.</p>
            )}

            {bays.length > 0 && (
              <div className="flex items-center gap-2 pb-1">
                <span className="w-28 text-xs font-medium text-zinc-500 uppercase tracking-wider">Bay</span>
                <span className="flex-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">Unit</span>
                <span className="w-36 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</span>
                <span className="w-6" />
              </div>
            )}

            {bays.map((bay, i) => {
              const alreadyUsed = usedBays(i).includes(bay.bay_label) && bay.bay_label !== ''
              return (
                <div key={i} className="flex items-center gap-2">
                  {/* Bay selector */}
                  <div className="flex flex-col gap-0.5">
                    <select
                      value={bay.bay_label}
                      onChange={e => updateBay(i, 'bay_label', e.target.value)}
                      className={`w-28 ${inputClass} ${alreadyUsed ? 'border-yellow-600' : ''}`}
                      aria-label="Bay"
                    >
                      <option value="">Bay…</option>
                      {BAY_OPTIONS.map(b => (
                        <option key={b} value={b}>Bay {b}</option>
                      ))}
                    </select>
                  </div>

                  {/* Unit selector */}
                  <select
                    value={bay.unit_id ?? ''}
                    onChange={e => updateBay(i, 'unit_id', e.target.value ? Number(e.target.value) : null)}
                    disabled={bay.unit_status !== 'unit_present'}
                    className={`flex-1 ${inputClass}`}
                    aria-label="Unit"
                  >
                    <option value="">No unit</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{formatUnit(u)}</option>
                    ))}
                  </select>

                  {/* Status selector */}
                  <select
                    value={bay.unit_status}
                    onChange={e => {
                      updateBay(i, 'unit_status', e.target.value)
                      if (e.target.value !== 'unit_present') updateBay(i, 'unit_id', null)
                    }}
                    className={`w-36 ${inputClass}`}
                    aria-label="Status"
                  >
                    <option value="unit_present">Present</option>
                    <option value="empty_bay">Empty bay</option>
                    <option value="unit_at_shop">At shop</option>
                  </select>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeBay(i)}
                    className="text-zinc-600 hover:text-red-400 p-1 rounded transition-colors shrink-0"
                    aria-label="Remove bay"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}

            {bays.some((b, i) => usedBays(i).includes(b.bay_label) && b.bay_label !== '') && (
              <p className="text-yellow-400 text-xs">Duplicate bay selected — each bay can only appear once.</p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || !selectedPostId}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {isPending ? 'Setting shift…' : 'Set Shift'}
          </button>
        </form>
      </div>
    </div>
  )
}
