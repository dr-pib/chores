'use client'

import { useState, useEffect, useTransition } from 'react'
import { BAY_OPTIONS } from '@/lib/bays'
import { formatUnit } from '@/lib/units'

interface Unit { id: number; unit_number: number; unit_type: string; unit_name: string | null }
interface Station { id: number; name: string }
interface ShiftProfile {
  id: number
  name: string
  default_start_time: string
  station: { id: number; name: string }
  default_unit: Unit | null
  default_unit_id: number | null
  bays: { id: number; bay_label: string; unit_id: number | null; unit: Unit | null; sort_order: number }[]
}
interface BayRow { bay_label: string; unit_id: number | null; sort_order: number }

const inputClass = 'h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
const labelClass = 'block text-sm text-zinc-300 mb-1.5'

export default function ShiftProfileEditPanel({ postId }: { postId: number }) {
  const [post, setPost] = useState<ShiftProfile | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [stationId, setStationId] = useState<number | ''>('')
  const [startTime, setStartTime] = useState('')
  const [defaultUnitId, setDefaultUnitId] = useState<number | ''>('')
  const [bays, setBays] = useState<BayRow[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError('')
    setSuccess(false)
    Promise.all([
      fetch(`/api/shift-profiles/${postId}`).then(r => r.json()),
      fetch('/api/stations').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
    ]).then(([postData, stationsData, unitsData]) => {
      if (postData.error) return
      setPost(postData)
      setStations(Array.isArray(stationsData) ? stationsData : [])
      setUnits(Array.isArray(unitsData) ? unitsData : [])
      setStationId(postData.station.id)
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
      setLoading(false)
    })
  }, [postId])

  function addBay() {
    setBays(prev => [...prev, { bay_label: '', unit_id: null, sort_order: prev.length + 1 }])
  }

  function removeBay(index: number) {
    const removedUnitId = bays[index]?.unit_id ?? null
    setBays(prev => prev.filter((_, i) => i !== index).map((b, i) => ({ ...b, sort_order: i + 1 })))
    if (removedUnitId === defaultUnitId) setDefaultUnitId('')
  }

  function updateBay(index: number, field: 'bay_label' | 'unit_id', value: string | number | null) {
    const currentUnitId = bays[index]?.unit_id ?? null
    setBays(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
    if (field === 'unit_id' && (value === null || value !== defaultUnitId) && currentUnitId === defaultUnitId) {
      setDefaultUnitId('')
    }
  }

  function setPrimaryUnit(unitId: number | null) {
    setDefaultUnitId(defaultUnitId === unitId || unitId == null ? '' : unitId)
  }

  const usedLabels = (currentIndex: number) =>
    bays.filter((_, i) => i !== currentIndex).map(b => b.bay_label).filter(Boolean)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stationId) { setError('Station is required'); return }
    if (!startTime) { setError('Start time is required'); return }
    const emptyBay = bays.find(b => !b.bay_label)
    if (emptyBay) { setError('Select a bay label for each row, or remove empty rows'); return }
    const dupBay = bays.find((b, i) => usedLabels(i).includes(b.bay_label))
    if (dupBay) { setError(`Bay ${dupBay.bay_label} is listed more than once`); return }
    setError('')
    setSuccess(false)
    startTransition(async () => {
      const res = await fetch(`/api/shift-profiles/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: stationId,
          default_start_time: startTime,
          default_unit_id: defaultUnitId || null,
          bays,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setPost(updated)
        setSuccess(true)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to save changes')
      }
    })
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Loading…</div>
  }
  if (!post) {
    return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Shift profile not found.</div>
  }

  return (
    <div className="flex-1 px-6 py-6 max-w-2xl">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-zinc-100">{post.name}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{post.station.name}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Default Start Time, Trucks and Bays</h2>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <label htmlFor="cp-station" className={labelClass}>Station</label>
              <select
                id="cp-station"
                value={stationId}
                onChange={e => setStationId(e.target.value ? Number(e.target.value) : '')}
                className={inputClass}
              >
                <option value="">Select station</option>
                {stations.map(station => (
                  <option key={station.id} value={station.id}>{station.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cp-start-time" className={labelClass}>Default start time</label>
              <input id="cp-start-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">Default trucks and bays</h3>
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
            <div className="hidden sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_5rem_1.5rem] gap-2 pb-1">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Bay</span>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Default truck</span>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 text-center">Primary</span>
            </div>
          )}

          <div className="space-y-2">
            {bays.map((bay, i) => {
              const isDup = usedLabels(i).includes(bay.bay_label) && bay.bay_label !== ''
              const isPrimary = bay.unit_id != null && bay.unit_id === defaultUnitId
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_5rem_1.5rem] sm:items-center rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 sm:hidden">Bay</label>
                    <select
                      value={bay.bay_label}
                      onChange={e => updateBay(i, 'bay_label', e.target.value)}
                      className={`w-full ${inputClass} ${isDup ? 'border-yellow-600' : ''}`}
                      aria-label={`Bay ${i + 1}`}
                    >
                      <option value="">Select bay…</option>
                      {BAY_OPTIONS.map(b => <option key={b} value={b}>Bay {b}</option>)}
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
                      {units.map(u => <option key={u.id} value={u.id}>{formatUnit(u)}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center justify-between gap-2 sm:justify-center">
                    <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 sm:hidden">Primary</span>
                    <input
                      type="checkbox"
                      checked={isPrimary}
                      disabled={bay.unit_id == null}
                      onChange={() => setPrimaryUnit(bay.unit_id)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 disabled:opacity-40"
                      aria-label={`Primary truck for bay ${bay.bay_label || i + 1}`}
                    />
                  </label>
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

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
