'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { BAY_OPTIONS } from '@/lib/bays'
import { formatUnit } from '@/lib/units'

interface Unit { id: number; unit_number: number; unit_type: string; unit_name?: string | null }
interface CrewPostBay { id: number; bay_label: string; unit_id: number | null; sort_order: number }
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

function normalizeBayLabel(label: string) {
  return label.replace(/^Bay\s+/i, '')
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
  }, [router])

  function initPostDefaults(post: CrewPost, shiftHours: number) {
    const now = new Date()
    const start = buildDefaultStart(post, now)
    const end = new Date(start.getTime() + shiftHours * 60 * 60 * 1000)
    setStartDt(formatLocalDatetime(start))
    setEndDt(formatLocalDatetime(end))
    const defaultBays = post.bays.length > 0
      ? post.bays.map((b, i) => ({
          bay_label: BAY_OPTIONS.includes(normalizeBayLabel(b.bay_label)) ? normalizeBayLabel(b.bay_label) : '',
          unit_id: b.unit_id ?? (i === 0 ? (post.default_unit?.id ?? null) : null),
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
        bay_label: normalizeBayLabel(pb.bay_label),
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

  const usedBays = (currentIndex: number) =>
    bays.filter((_, i) => i !== currentIndex).map(b => b.bay_label).filter(Boolean)

  const selectedPost = crewPosts.find(p => p.id === selectedPostId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPostId || !startDt || !endDt) { setError('Fill all required fields'); return }
    const unnamedBay = bays.find(b => !b.bay_label)
    if (unnamedBay) { setError('Select a bay for each row, or remove empty rows'); return }
    const dupBay = bays.find((b, i) => usedBays(i).includes(b.bay_label))
    if (dupBay) { setError(`Bay ${dupBay.bay_label} listed more than once`); return }
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
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <span className="font-mono text-xs text-zinc-600 uppercase tracking-widest">LOADING…</span>
      </div>
    )
  }

  const hasDupBay = bays.some((b, i) => usedBays(i).includes(b.bay_label) && b.bay_label !== '')

  return (
    <div className="min-h-screen bg-[#09090b]">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="max-w-[720px] mx-auto px-4 py-4">

        {/* Page header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wide text-zinc-100">SHIFT SETUP</h1>
            <div className="font-mono text-[10px] text-zinc-600 mt-0.5">
              {user.name.toUpperCase()}
              {selectedPost && <span className="ml-2 text-zinc-700">· {selectedPost.name} · {selectedPost.station.name}</span>}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* ── Crew & schedule ─────────────────────────────────── */}
          <div className="op-panel">
            <div className="px-3 py-1 border-b border-[#1e2028] bg-[#0a0b0d]">
              <span className="op-section-label">CREW &amp; SCHEDULE</span>
            </div>
            <div className="px-3 py-3 space-y-3">
              <div>
                <label className="op-label block mb-1" htmlFor="crew-post">CREW POST</label>
                <select
                  id="crew-post"
                  value={selectedPostId ?? ''}
                  onChange={e => handlePostChange(Number(e.target.value))}
                  className="op-input"
                >
                  <option value="">Select crew…</option>
                  {crewPosts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.station.name}</option>
                  ))}
                </select>
              </div>

              {selectedPost && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="op-label block mb-1" htmlFor="shift-start">START</label>
                    <input id="shift-start" type="datetime-local" value={startDt} onChange={e => setStartDt(e.target.value)} className="op-input" />
                  </div>
                  <div>
                    <label className="op-label block mb-1" htmlFor="shift-end">END</label>
                    <input id="shift-end" type="datetime-local" value={endDt} onChange={e => setEndDt(e.target.value)} className="op-input" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Partner ─────────────────────────────────────────── */}
          <div className="op-panel">
            <div className="px-3 py-1 border-b border-[#1e2028] bg-[#0a0b0d]">
              <span className="op-section-label">PARTNER</span>
            </div>
            <div className="px-3 py-3">
              <select
                id="partner"
                value={partnerId}
                onChange={e => setPartnerId(e.target.value === '' ? '' : Number(e.target.value))}
                className="op-input"
              >
                <option value="">Solo / No partner</option>
                {employees.filter(e => e.id !== user.id).map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.licensure_level})</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Trucks / Bays ────────────────────────────────────── */}
          <div className="op-panel">
            <div className="flex items-center justify-between px-3 py-1 border-b border-[#1e2028] bg-[#0a0b0d]">
              <span className="op-section-label">TRUCKS / BAYS</span>
              <button type="button" onClick={addBay} className="op-btn op-btn-ghost text-[9px]">+ ADD</button>
            </div>

            <div className="px-3 py-2 space-y-2">
              {bays.length === 0 && (
                <p className="font-mono text-[10px] text-zinc-700 py-2 text-center uppercase tracking-wider border border-dashed border-zinc-800">
                  No trucks added
                </p>
              )}

              {bays.length > 0 && (
                <div className="hidden sm:grid grid-cols-[5rem_1fr_7rem_1.5rem] gap-2 pb-1">
                  {['BAY', 'UNIT', 'STATUS', ''].map(h => (
                    <span key={h} className="op-label">{h}</span>
                  ))}
                </div>
              )}

              {bays.map((bay, i) => {
                const alreadyUsed = usedBays(i).includes(bay.bay_label) && bay.bay_label !== ''
                return (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[5rem_1fr_7rem_1.5rem] gap-2 items-center border-b border-[#1a1c24] pb-2 sm:border-0 sm:pb-0">
                    <div>
                      <label className="op-label block mb-0.5 sm:hidden">BAY</label>
                      <select
                        value={bay.bay_label}
                        onChange={e => updateBay(i, 'bay_label', e.target.value)}
                        className={`op-input ${alreadyUsed ? 'border-amber-600' : ''}`}
                        aria-label="Bay"
                      >
                        <option value="">Bay…</option>
                        {BAY_OPTIONS.map(b => <option key={b} value={b}>Bay {b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="op-label block mb-0.5 sm:hidden">UNIT</label>
                      <select
                        value={bay.unit_id ?? ''}
                        onChange={e => updateBay(i, 'unit_id', e.target.value ? Number(e.target.value) : null)}
                        disabled={bay.unit_status !== 'unit_present'}
                        className="op-input"
                        aria-label="Unit"
                      >
                        <option value="">No unit</option>
                        {units.map(u => <option key={u.id} value={u.id}>{formatUnit(u)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="op-label block mb-0.5 sm:hidden">STATUS</label>
                      <select
                        value={bay.unit_status}
                        onChange={e => {
                          updateBay(i, 'unit_status', e.target.value)
                          if (e.target.value !== 'unit_present') updateBay(i, 'unit_id', null)
                        }}
                        className="op-input"
                        aria-label="Status"
                      >
                        <option value="unit_present">Present</option>
                        <option value="empty_bay">Empty bay</option>
                        <option value="unit_at_shop">At shop</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBay(i)}
                      className="text-zinc-700 hover:text-red-500 transition-colors p-0.5 self-center"
                      aria-label="Remove bay"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}

              {hasDupBay && (
                <p className="font-mono text-[10px] text-amber-500">⚠ DUPLICATE BAY — each bay can only appear once</p>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="border border-red-800/50 bg-red-950/20 px-3 py-2">
              <p className="font-mono text-[10px] text-red-400 uppercase tracking-wide">⚠ {error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !selectedPostId}
            className="w-full op-btn op-btn-primary py-2.5 text-xs tracking-widest"
          >
            {isPending ? 'SUBMITTING…' : 'CONFIRM SHIFT'}
          </button>
        </form>
      </div>
    </div>
  )
}
