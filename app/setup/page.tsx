'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

interface Unit { id: number; unit_number: number; unit_type: string }
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

function formatLocalDatetime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildDefaultStart(post: CrewPost, baseDate: Date): Date {
  const [h, m] = post.default_start_time.split(':').map(Number)
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m)
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

  // Load initial data
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
        if (post) initPostDefaults(post, meData.user.default_shift_length_hours ?? 24, unitsData)
      }

      if (meData.user.default_partner_id) setPartnerId(meData.user.default_partner_id)
    })
  }, [])

  function initPostDefaults(post: CrewPost, shiftHours: number, allUnits: Unit[]) {
    const now = new Date()
    const start = buildDefaultStart(post, now)
    const end = new Date(start.getTime() + shiftHours * 60 * 60 * 1000)
    setStartDt(formatLocalDatetime(start))
    setEndDt(formatLocalDatetime(end))
    const defaultBays = post.bays.map((b) => ({
      bay_label: b.bay_label,
      unit_id: post.default_unit?.id ?? null,
      unit_status: 'unit_present' as const,
      sort_order: b.sort_order,
    }))
    setBays(defaultBays)
  }

  // When post changes, update defaults and load previous bay data
  async function handlePostChange(postId: number) {
    setSelectedPostId(postId)
    const post = crewPosts.find(p => p.id === postId)
    if (!post || !user) return
    initPostDefaults(post, user.default_shift_length_hours ?? 24, units)

    // Load previous bay data
    const res = await fetch(`/api/operations-logs/previous-bay?crew_post_id=${postId}`)
    const { bays: prevBays } = await res.json()
    if (prevBays && prevBays.length > 0) {
      setBays(post.bays.map((b, i) => {
        const prev: PrevBay | undefined = prevBays.find((pb: PrevBay) => pb.bay_label === b.bay_label) ?? prevBays[i]
        return {
          bay_label: b.bay_label,
          unit_id: prev?.unit_id ?? post.default_unit?.id ?? null,
          unit_status: (prev?.unit_status as BayState['unit_status']) ?? 'unit_present',
          sort_order: b.sort_order,
        }
      }))
    }
  }

  function updateBay(index: number, field: keyof BayState, value: string | number | null) {
    setBays(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
  }

  const selectedPost = crewPosts.find(p => p.id === selectedPostId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPostId || !startDt || !endDt) { setError('Please fill in all required fields'); return }
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
          {/* Crew Post */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Post &amp; Schedule</h2>

            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">Crew / Post</label>
              <select
                value={selectedPostId ?? ''}
                onChange={(e) => handlePostChange(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select post…</option>
                {crewPosts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.station.name}</option>
                ))}
              </select>
            </div>

            {selectedPost && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">Start</label>
                  <input
                    type="datetime-local"
                    value={startDt}
                    onChange={(e) => setStartDt(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">End</label>
                  <input
                    type="datetime-local"
                    value={endDt}
                    onChange={(e) => setEndDt(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Partner */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <label className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">Partner</label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No partner / solo</option>
              {employees.filter(e => e.id !== user.id).map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.licensure_level})</option>
              ))}
            </select>
          </div>

          {/* Bays */}
          {bays.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Bays</h2>
              {bays.map((bay, i) => (
                <div key={bay.bay_label} className="flex items-center gap-3">
                  <span className="text-zinc-400 text-sm w-14 shrink-0">{bay.bay_label}</span>
                  <select
                    value={bay.unit_id ?? ''}
                    onChange={(e) => updateBay(i, 'unit_id', e.target.value ? Number(e.target.value) : null)}
                    disabled={bay.unit_status !== 'unit_present'}
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">No unit</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>Unit {u.unit_number} ({u.unit_type})</option>
                    ))}
                  </select>
                  <select
                    value={bay.unit_status}
                    onChange={(e) => {
                      updateBay(i, 'unit_status', e.target.value)
                      if (e.target.value !== 'unit_present') updateBay(i, 'unit_id', null)
                    }}
                    className="w-44 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="unit_present">Unit present</option>
                    <option value="empty_bay">Empty bay</option>
                    <option value="unit_at_shop">Unit at shop</option>
                  </select>
                </div>
              ))}
            </div>
          )}

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
