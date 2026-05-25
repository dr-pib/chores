'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { BAY_OPTIONS } from '@/lib/bays'
import { formatUnit } from '@/lib/units'
import { compareEmployeesByLastName, formatEmployeeDropdown } from '@/lib/employees'

interface Unit { id: number; unit_number: number; unit_type: string; unit_name?: string | null }
interface ShiftProfileBay { id: number; bay_label: string; unit_id: number | null; sort_order: number }
interface ShiftProfile {
  id: number; name: string; default_start_time: string; default_shift_length_hours: number
  station: { id: number; name: string }; default_unit: Unit | null; bays: ShiftProfileBay[]
}
interface Employee { id: number; name: string; email_username: string; licensure_level: string; role: string; default_shift_profile_id: number | null }
interface PrevBay { bay_label: string; unit_id: number | null; unit_status: string; unit: Unit | null }

interface BayState {
  bay_label: string
  unit_id: number | null
  unit_status: 'unit_present' | 'empty_bay' | 'unit_at_shop'
  sort_order: number
}

const inputClass = 'h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
const labelClass = 'block text-sm text-zinc-300 mb-1.5'

function formatLocalDatetime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localDatePart(value: string) {
  return value.split('T')[0] ?? ''
}

function localTimePart(value: string) {
  return value.split('T')[1] ?? ''
}

function combineLocalDatetime(date: string, time: string) {
  if (!date || !time) return ''
  return `${date}T${time}`
}

function buildDefaultStart(post: ShiftProfile, baseDate: Date): Date {
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

  const [user, setUser] = useState<{ id: number; name: string; role: string; default_shift_length_hours: number; default_shift_profile_id: number | null } | null>(null)
  const [shiftProfiles, setShiftProfiles] = useState<ShiftProfile[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [units, setUnits] = useState<Unit[]>([])

  const [hasExistingShift, setHasExistingShift] = useState(false)
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [startDt, setStartDt] = useState('')
  const [endDt, setEndDt] = useState('')
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [bays, setBays] = useState<BayState[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/shift-profiles').then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
      fetch('/api/operations-logs/current').then(r => r.json()),
    ]).then(([meData, postsData, empsData, unitsData, currentData]) => {
      if (!meData.user) { router.push('/login'); return }
      setUser(meData.user)
      setShiftProfiles(postsData)
      setEmployees(empsData)
      setUnits(unitsData)

      const currentLog = currentData?.log
      if (currentLog) {
        setHasExistingShift(true)
        setSelectedPostId(currentLog.shift_profile_id)
        setStartDt(formatLocalDatetime(new Date(currentLog.actual_start)))
        setEndDt(formatLocalDatetime(new Date(currentLog.actual_end)))
        setPartnerId(currentLog.partner_employee_id ?? '')
        setBays(currentLog.bays.map((b: { bay_label: string; unit_id: number | null; unit_status: string; sort_order: number }) => ({
          bay_label: normalizeBayLabel(b.bay_label),
          unit_id: b.unit_id,
          unit_status: b.unit_status as BayState['unit_status'],
          sort_order: b.sort_order,
        })))
      } else {
        setHasExistingShift(false)
        const defaultPostId = meData.user.default_shift_profile_id ?? postsData[0]?.id
        if (defaultPostId) {
          setSelectedPostId(defaultPostId)
          const post = postsData.find((p: ShiftProfile) => p.id === defaultPostId)
          if (post) initPostDefaults(post, meData.user.default_shift_length_hours ?? 24)
        }
        if (meData.user.default_partner_id) setPartnerId(meData.user.default_partner_id)
      }
    })
  }, [router])

  function initPostDefaults(post: ShiftProfile, shiftHours: number) {
    const now = new Date()
    const start = buildDefaultStart(post, now)
    const end = new Date(start.getTime() + shiftHours * 60 * 60 * 1000)
    setStartDt(formatLocalDatetime(start))
    setEndDt(formatLocalDatetime(end))
    // One bay row per shift profile default bay; use per-bay unit_id (fallback to the profile default for bay 1 only)
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
    const post = shiftProfiles.find(p => p.id === postId)
    if (!post || !user) return
    initPostDefaults(post, user.default_shift_length_hours ?? 24)

    const res = await fetch(`/api/operations-logs/previous-bay?shift_profile_id=${postId}`)
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

  function updateStart(nextStart: string) {
    const oldStartMs = new Date(startDt).getTime()
    const oldEndMs = new Date(endDt).getTime()
    const duration = oldEndMs - oldStartMs

    if (!isNaN(new Date(nextStart).getTime()) && duration > 0) {
      setEndDt(formatLocalDatetime(new Date(new Date(nextStart).getTime() + duration)))
    }
    setStartDt(nextStart)
  }

  function updateStartDate(date: string) {
    updateStart(combineLocalDatetime(date, localTimePart(startDt)))
  }

  function updateStartTime(time: string) {
    updateStart(combineLocalDatetime(localDatePart(startDt), time))
  }

  function updateEndDate(date: string) {
    setEndDt(combineLocalDatetime(date, localTimePart(endDt)))
  }

  function updateEndTime(time: string) {
    setEndDt(combineLocalDatetime(localDatePart(endDt), time))
  }

  function applyDuration(hours: 24 | 48) {
    const start = new Date(startDt)
    if (isNaN(start.getTime())) return
    setEndDt(formatLocalDatetime(new Date(start.getTime() + hours * 60 * 60 * 1000)))
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

  const selectedPost = shiftProfiles.find(p => p.id === selectedPostId)
  const durationHours = startDt && endDt
    ? (new Date(endDt).getTime() - new Date(startDt).getTime()) / (60 * 60 * 1000)
    : null

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
          shift_profile_id: selectedPostId,
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
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">
            {hasExistingShift ? 'Edit Current Shift' : 'Set Up Your Shift'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
            <div className="mb-5">
              <label htmlFor="crew-post" className={labelClass}>Shift Profile</label>
              <select
                id="crew-post"
                value={selectedPostId ?? ''}
                onChange={(e) => handlePostChange(Number(e.target.value))}
                className={`w-full ${inputClass}`}
              >
                <option value="">Select shift profile…</option>
                {shiftProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.station.name}</option>
                ))}
              </select>
            </div>

            {selectedPost && (
              <div className="mb-5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <label htmlFor="shift-start-date" className={labelClass}>Start date</label>
                    <input
                      id="shift-start-date"
                      type="date"
                      value={localDatePart(startDt)}
                      onChange={e => updateStartDate(e.target.value)}
                      className={`w-full ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="shift-start-time" className={labelClass}>Start time</label>
                    <input
                      id="shift-start-time"
                      type="time"
                      value={localTimePart(startDt)}
                      onChange={e => updateStartTime(e.target.value)}
                      className={`w-full ${inputClass}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-36">
                    {[24, 48].map(hours => {
                      const selectedDuration = durationHours != null && Math.abs(durationHours - hours) < 0.01
                      return (
                        <button
                          key={hours}
                          type="button"
                          onClick={() => applyDuration(hours as 24 | 48)}
                          className={`h-10 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                            selectedDuration
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-blue-500 hover:text-zinc-100'
                          }`}
                        >
                          {hours}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="shift-end-date" className={labelClass}>End date</label>
                    <input
                      id="shift-end-date"
                      type="date"
                      value={localDatePart(endDt)}
                      onChange={e => updateEndDate(e.target.value)}
                      className={`w-full ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="shift-end-time" className={labelClass}>End time</label>
                    <input
                      id="shift-end-time"
                      type="time"
                      value={localTimePart(endDt)}
                      onChange={e => updateEndTime(e.target.value)}
                      className={`w-full ${inputClass}`}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mb-5">
              <label htmlFor="partner" className={labelClass}>Partner</label>
              <select
                id="partner"
                value={partnerId}
                onChange={e => setPartnerId(e.target.value === '' ? '' : Number(e.target.value))}
                className={`w-full ${inputClass}`}
              >
                <option value="">No partner / solo</option>
                {employees.filter(e => e.id !== user.id).sort(compareEmployeesByLastName).map(e => (
                  <option key={e.id} value={e.id}>{formatEmployeeDropdown(e)}</option>
                ))}
              </select>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-100">Trucks</h2>
              <button
                type="button"
                onClick={addBay}
                className="shrink-0 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
              >
                + Add truck
              </button>
            </div>

            {bays.length === 0 && (
              <p className="rounded-lg border border-dashed border-zinc-700 px-4 py-5 text-center text-sm text-zinc-500">
                No trucks added yet.
              </p>
            )}

            {bays.length > 0 && (
              <div className="hidden items-center gap-2 pb-2 sm:flex">
                <span className="w-28 text-xs font-medium text-zinc-500 uppercase tracking-wider">Bay</span>
                <span className="flex-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">Unit</span>
                <span className="w-36 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</span>
                <span className="w-6" />
              </div>
            )}

            {bays.map((bay, i) => {
              const alreadyUsed = usedBays(i).includes(bay.bay_label) && bay.bay_label !== ''
              return (
                <div key={i} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_9rem_1.5rem] sm:items-end sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0">
                  <div>
                    <label htmlFor={`bay-${i}`} className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 sm:hidden">
                      Bay
                    </label>
                    <select
                      id={`bay-${i}`}
                      value={bay.bay_label}
                      onChange={e => updateBay(i, 'bay_label', e.target.value)}
                      className={`w-full ${inputClass} ${alreadyUsed ? 'border-yellow-600' : ''}`}
                      aria-label="Bay"
                    >
                      <option value="">Bay…</option>
                      {BAY_OPTIONS.map(b => (
                        <option key={b} value={b}>Bay {b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`unit-${i}`} className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 sm:hidden">
                      Unit
                    </label>
                    <select
                      id={`unit-${i}`}
                      value={bay.unit_id ?? ''}
                      onChange={e => updateBay(i, 'unit_id', e.target.value ? Number(e.target.value) : null)}
                      disabled={bay.unit_status !== 'unit_present'}
                      className={`w-full ${inputClass}`}
                      aria-label="Unit"
                    >
                      <option value="">No unit</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{formatUnit(u)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`status-${i}`} className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 sm:hidden">
                      Status
                    </label>
                    <select
                      id={`status-${i}`}
                      value={bay.unit_status}
                      onChange={e => {
                        updateBay(i, 'unit_status', e.target.value)
                        if (e.target.value !== 'unit_present') updateBay(i, 'unit_id', null)
                      }}
                      className={`w-full ${inputClass}`}
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
                    className="rounded p-2 text-zinc-600 transition-colors hover:text-red-400 sm:p-1"
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
            {isPending ? (hasExistingShift ? 'Saving…' : 'Setting shift…') : (hasExistingShift ? 'Save Changes' : 'Set Shift')}
          </button>
        </form>
      </div>
    </div>
  )
}
