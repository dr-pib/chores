'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { BAY_OPTIONS } from '@/lib/bays'
import { formatUnit } from '@/lib/units'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Employee { id: number; name: string; licensure_level: string }
interface ShiftProfileBay { bay_label: string; unit_id: number | null; sort_order: number }
interface ShiftProfile {
  id: number; name: string; default_start_time: string; default_shift_length_hours: number
  default_unit: { id: number } | null; bays: ShiftProfileBay[]
}
interface Unit { id: number; unit_number: number; unit_type?: string | null; unit_name?: string | null }
interface NarcBox { id: number; letter: string }
interface Chore { id: number; status: string; chore_date: string; chore_template: { name: string }; unit: { unit_number: number } | null }
interface CreatedLog { id: number; chores: Chore[] }
interface DevUser { id: number; name: string; role: string }

interface BayState {
  bay_label: string
  unit_id: number | null
  unit_status: 'unit_present' | 'empty_bay' | 'unit_at_shop'
  sort_order: number
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toLocalDT(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function defaultStart(profile: ShiftProfile, date: Date): string {
  const [h, m] = profile.default_start_time.split(':').map(Number)
  return toLocalDT(new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m))
}
function normalizeBayLabel(label: string) {
  return label.replace(/^Bay\s+/i, '')
}
function makeEmptyBay(sortOrder: number, defaultUnitId: number | null = null): BayState {
  return { bay_label: '', unit_id: defaultUnitId, unit_status: 'unit_present', sort_order: sortOrder }
}
function baysFromProfile(profile: ShiftProfile): BayState[] {
  if (profile.bays.length === 0) {
    return [makeEmptyBay(1, profile.default_unit?.id ?? null)]
  }
  return profile.bays.map((b, i) => ({
    bay_label: BAY_OPTIONS.includes(normalizeBayLabel(b.bay_label)) ? normalizeBayLabel(b.bay_label) : '',
    unit_id: b.unit_id ?? (i === 0 ? (profile.default_unit?.id ?? null) : null),
    unit_status: 'unit_present' as const,
    sort_order: i + 1,
  }))
}
function formatChoreDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DevPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [user, setUser] = useState<DevUser | null>(null)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [profiles, setProfiles] = useState<ShiftProfile[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [narcBoxes, setNarcBoxes] = useState<NarcBox[]>([])

  // Form state
  const yesterday = new Date(Date.now() - 86400000)
  const [serviceDate, setServiceDate] = useState(toLocalDT(new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 7, 0)).slice(0, 10))
  const [profileId, setProfileId] = useState<number | ''>('')
  const [primaryEmpId, setPrimaryEmpId] = useState<number | ''>('')
  const [partnerEmpId, setPartnerEmpId] = useState<number | ''>('')
  const [narcBoxId, setNarcBoxId] = useState<number | ''>('')
  const [startDt, setStartDt] = useState('')
  const [endDt, setEndDt] = useState('')
  const [bays, setBays] = useState<BayState[]>([])
  const [shiftHours, setShiftHours] = useState(24)

  // Result state
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [createdLog, setCreatedLog] = useState<CreatedLog | null>(null)
  const [completing, setCompleting] = useState<Set<number>>(new Set())
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      if (!d.user || d.user.role !== 'Dom') { router.push('/login'); return }
      setUser(d.user)
      setAuthorized(true)
    })
    Promise.all([
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/shift-profiles').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
      fetch('/api/narc-boxes').then(r => r.json()),
    ]).then(([emps, profs, uts, boxes]) => {
      setEmployees(Array.isArray(emps) ? emps.sort((a: Employee, b: Employee) => a.name.localeCompare(b.name)) : [])
      setProfiles(Array.isArray(profs) ? profs : [])
      setUnits(Array.isArray(uts) ? uts : [])
      setNarcBoxes(Array.isArray(boxes) ? boxes : [])
    })
  }, [router])

  // Recompute start/end whenever profile, date, or length changes.
  useEffect(() => {
    if (!profileId || !serviceDate) return
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    const base = new Date(serviceDate + 'T00:00:00')
    const start = defaultStart(profile, base)
    setStartDt(start)
    setEndDt(toLocalDT(new Date(new Date(start).getTime() + shiftHours * 3600000)))
  }, [profileId, serviceDate, shiftHours, profiles])

  // Pull all bay/unit defaults from the shift profile when it changes.
  function handleProfileChange(id: number | '') {
    setProfileId(id)
    const profile = profiles.find(p => p.id === id)
    setBays(profile ? baysFromProfile(profile) : [])
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const primaryUnit = bays.find(b => b.unit_status === 'unit_present')?.unit_id
    if (!profileId || !primaryEmpId || !startDt || !endDt || !primaryUnit) {
      setError('Profile, primary employee, times, and at least one present unit are required')
      return
    }
    if (bays.some(b => !b.bay_label)) {
      setError('Select a bay for each row, or remove empty rows')
      return
    }
    setError('')
    setCreating(true)
    setCreatedLog(null)
    setCompletedIds(new Set())

    try {
      // Step 1: generate SW for this date so expires get claimed
      const dateStr = serviceDate
      await fetch('/api/admin/generate-scheduled-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: dateStr, end_date: dateStr }),
      })

      // Step 2: create the shift with the full bay configuration
      const body: Record<string, unknown> = {
        shift_profile_id: profileId,
        primary_employee_id: primaryEmpId,
        partner_employee_id: partnerEmpId || null,
        primary_unit_id: primaryUnit,
        actual_start: new Date(startDt).toISOString(),
        actual_end: new Date(endDt).toISOString(),
        narc_box_id: narcBoxId || null,
        bays: bays.map(b => ({
          bay_label: b.bay_label,
          unit_id: b.unit_status === 'unit_present' ? b.unit_id : null,
          unit_status: b.unit_status,
          sort_order: b.sort_order,
        })),
      }

      const res = await fetch('/api/operations-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to create shift')
        return
      }

      const log = await res.json()
      setCreatedLog(log)
    } catch {
      setError('Network error')
    } finally {
      setCreating(false)
    }
  }

  async function completeChore(choreId: number) {
    setCompleting(prev => new Set(prev).add(choreId))
    try {
      const res = await fetch(`/api/chores/${choreId}/complete`, { method: 'POST' })
      if (res.ok) setCompletedIds(prev => new Set(prev).add(choreId))
    } finally {
      setCompleting(prev => { const s = new Set(prev); s.delete(choreId); return s })
    }
  }

  async function completeAll() {
    if (!createdLog) return
    const pending = createdLog.chores.filter(c => c.status !== 'completed' && !completedIds.has(c.id))
    await Promise.all(pending.map(c => completeChore(c.id)))
  }

  if (authorized === null || !user) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Checking access…</div>

  const selectClass = "w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm"
  const labelClass = "block text-xs text-zinc-500 mb-1"

  const sortedChores = createdLog
    ? [...createdLog.chores].sort((a, b) =>
        a.chore_date === b.chore_date
          ? a.chore_template.name.localeCompare(b.chore_template.name)
          : a.chore_date.localeCompare(b.chore_date))
    : []

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Dev — Historical Shift Builder</h1>
          <p className="text-zinc-500 text-sm mt-1">Dom only. Creates backdated shifts for demo/testing.</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Service Date</label>
              <input type="date" value={serviceDate}
                onChange={e => setServiceDate(e.target.value)}
                className={selectClass} />
            </div>
            <div>
              <label className={labelClass}>Shift Length</label>
              <div className="flex gap-2">
                {[24, 48].map(h => (
                  <button key={h} type="button"
                    onClick={() => setShiftHours(h)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${shiftHours === h ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                  >{h}h</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Shift Profile</label>
            <select value={profileId} onChange={e => handleProfileChange(Number(e.target.value) || '')} className={selectClass}>
              <option value="">Select profile…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start</label>
              <input type="datetime-local" value={startDt}
                onChange={e => { setStartDt(e.target.value); if (endDt) setEndDt(toLocalDT(new Date(new Date(e.target.value).getTime() + shiftHours * 3600000))) }}
                className={selectClass} />
            </div>
            <div>
              <label className={labelClass}>End</label>
              <input type="datetime-local" value={endDt} onChange={e => setEndDt(e.target.value)} className={selectClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Primary Employee</label>
            <select value={primaryEmpId} onChange={e => setPrimaryEmpId(Number(e.target.value) || '')} className={selectClass}>
              <option value="">Select employee…</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}, {emp.licensure_level}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Partner (optional)</label>
            <select value={partnerEmpId} onChange={e => setPartnerEmpId(Number(e.target.value) || '')} className={selectClass}>
              <option value="">None</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}, {emp.licensure_level}</option>)}
            </select>
          </div>

          {/* Trucks — full bay editor, defaults pulled from the shift profile */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass + ' mb-0'}>Trucks</label>
              <button type="button" onClick={addBay}
                className="text-xs text-blue-300 hover:text-blue-200 transition-colors">+ Add truck</button>
            </div>
            {bays.length === 0 && (
              <p className="text-zinc-600 text-xs">Select a shift profile to load its bay defaults.</p>
            )}
            <div className="space-y-2">
              {bays.map((bay, i) => {
                const dup = bay.bay_label !== '' && usedBays(i).includes(bay.bay_label)
                return (
                  <div key={i} className="grid grid-cols-[5rem_1fr_6rem_1.25rem] gap-2 items-center">
                    <select value={bay.bay_label} onChange={e => updateBay(i, 'bay_label', e.target.value)}
                      className={`${selectClass} ${dup ? 'border-yellow-600' : ''}`} aria-label="Bay">
                      <option value="">Bay…</option>
                      {BAY_OPTIONS.map(b => <option key={b} value={b}>Bay {b}</option>)}
                    </select>
                    <select value={bay.unit_id ?? ''} onChange={e => updateBay(i, 'unit_id', e.target.value ? Number(e.target.value) : null)}
                      disabled={bay.unit_status !== 'unit_present'}
                      className={`${selectClass} disabled:opacity-50`} aria-label="Unit">
                      <option value="">Unit…</option>
                      {units.map(u => <option key={u.id} value={u.id}>{formatUnit(u)}</option>)}
                    </select>
                    <select value={bay.unit_status}
                      onChange={e => { updateBay(i, 'unit_status', e.target.value); if (e.target.value !== 'unit_present') updateBay(i, 'unit_id', null) }}
                      className={selectClass} aria-label="Status">
                      <option value="unit_present">Present</option>
                      <option value="empty_bay">Empty</option>
                      <option value="unit_at_shop">At shop</option>
                    </select>
                    <button type="button" onClick={() => removeBay(i)}
                      className="text-zinc-600 hover:text-red-400 transition-colors text-sm" aria-label="Remove bay">✕</button>
                  </div>
                )
              })}
            </div>
            {bays.some((b, i) => b.bay_label !== '' && usedBays(i).includes(b.bay_label)) && (
              <p className="text-yellow-400 text-xs mt-1">Duplicate bay selected — each bay can only appear once.</p>
            )}
          </div>

          <div>
            <label className={labelClass}>NARC Box (optional)</label>
            <select value={narcBoxId} onChange={e => setNarcBoxId(Number(e.target.value) || '')} className={selectClass}>
              <option value="">None</option>
              {narcBoxes.map(b => <option key={b.id} value={b.id}>Box {b.letter}</option>)}
            </select>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={creating}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-semibold text-sm transition-colors">
            {creating ? 'Creating…' : 'Create Shift'}
          </button>
        </form>

        {/* Chore completion panel */}
        {createdLog && (
          <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">
                Shift created — {completedIds.size}/{createdLog.chores.length} chores complete
              </h2>
              <button onClick={completeAll}
                className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                Mark all complete
              </button>
            </div>
            <div className="space-y-2">
              {sortedChores.map(chore => {
                const done = chore.status === 'completed' || completedIds.has(chore.id)
                return (
                  <div key={chore.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[11px] font-medium text-zinc-500 tabular-nums w-12">
                        {formatChoreDate(chore.chore_date)}
                      </span>
                      <span className={done ? 'text-zinc-500 line-through' : 'text-zinc-200'}>
                        {chore.chore_template.name}
                        {chore.unit && <span className="text-zinc-500 ml-1">Unit {chore.unit.unit_number}</span>}
                      </span>
                    </div>
                    {!done && (
                      <button onClick={() => completeChore(chore.id)}
                        disabled={completing.has(chore.id)}
                        className="text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 px-2 py-1 rounded transition-colors shrink-0">
                        {completing.has(chore.id) ? '…' : 'Complete'}
                      </button>
                    )}
                    {done && <span className="text-xs text-emerald-500 shrink-0">✓</span>}
                  </div>
                )
              })}
            </div>
            <button onClick={() => { setCreatedLog(null); setCompletedIds(new Set()) }}
              className="mt-4 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              ← Create another shift
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
