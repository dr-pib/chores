'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { compareEmployeesByLastName, formatEmployeeDropdown } from '@/lib/employees'

interface Employee {
  id: number
  name: string
  email: string | null
  email_username: string
  emt_number: string
  licensure_level: string
  role: string
  status: string
  default_station_id: number | null
  default_shift_profile_id: number | null
  default_shift_length_hours: number
  default_partner_id: number | null
  default_partner: { id: number; name: string } | null
}

interface Station { id: number; name: string }
interface ShiftProfile { id: number; name: string; station: { name: string } }
interface EmployeeSummary { id: number; name: string; licensure_level: string }

const inputClass = 'px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 w-full'
const labelClass = 'block text-sm text-zinc-300 mb-1.5'

export default function EditEmployeePage() {
  const router = useRouter()
  const params = useParams()
  const employeeId = params.id as string

  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [shiftProfiles, setShiftProfiles] = useState<ShiftProfile[]>([])
  const [allEmployees, setAllEmployees] = useState<EmployeeSummary[]>([])

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailUsername, setEmailUsername] = useState('')
  const [licensureLevel, setLicensureLevel] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [defaultStationId, setDefaultStationId] = useState<number | ''>('')
  const [defaultShiftProfileId, setDefaultShiftProfileId] = useState<number | ''>('')
  const [defaultShiftLengthHours, setDefaultShiftLengthHours] = useState(24)
  const [defaultPartnerId, setDefaultPartnerId] = useState<number | ''>('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  // EMT number edit — Dom only
  const [showEmtDialog, setShowEmtDialog] = useState(false)
  const [newEmtNumber, setNewEmtNumber] = useState('')
  const [emtPending, setEmtPending] = useState(false)
  const [emtError, setEmtError] = useState('')
  const [emtSuccess, setEmtSuccess] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch(`/api/employees/${employeeId}`).then(r => r.json()),
      fetch('/api/stations').then(r => r.json()),
      fetch('/api/shift-profiles').then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
    ]).then(([meData, empData, stationsData, postsData, empsData]) => {
      if (!meData.user) { router.push('/login'); return }
      const userRole = meData.user.role
      if (!['Dom', 'Admin', 'Supervisor'].includes(userRole)) { router.push('/setup'); return }
      if (empData.error) { router.push('/employees'); return }

      setCurrentUser(meData.user)
      setEmployee(empData)
      setStations(Array.isArray(stationsData) ? stationsData : [])
      setShiftProfiles(Array.isArray(postsData) ? postsData : [])
      setAllEmployees(Array.isArray(empsData) ? empsData : [])

      setName(empData.name)
      setEmail(empData.email ?? '')
      setEmailUsername(empData.email_username)
      setLicensureLevel(empData.licensure_level)
      setRole(empData.role)
      setStatus(empData.status)
      setDefaultStationId(empData.default_station_id ?? '')
      setDefaultShiftProfileId(empData.default_shift_profile_id ?? '')
      setDefaultShiftLengthHours(empData.default_shift_length_hours)
      setDefaultPartnerId(empData.default_partner_id ?? '')
    })
  }, [employeeId, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !emailUsername.trim() || !licensureLevel || !role || !status) {
      setError('Name, username, licensure level, role, and status are required')
      return
    }
    setError('')
    setSuccess(false)

    startTransition(async () => {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          email_username: emailUsername.trim(),
          licensure_level: licensureLevel,
          role,
          status,
          default_station_id: defaultStationId || null,
          default_shift_profile_id: defaultShiftProfileId || null,
          default_shift_length_hours: defaultShiftLengthHours,
          default_partner_id: defaultPartnerId || null,
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

  async function handleEmtSave() {
    if (!newEmtNumber.trim()) { setEmtError('EMT number cannot be blank'); return }
    setEmtPending(true)
    setEmtError('')
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emt_number: newEmtNumber.trim() }),
      })
      if (res.ok) {
        const updated = await res.json()
        setEmployee(prev => prev ? { ...prev, emt_number: updated.emt_number } : prev)
        setEmtSuccess(true)
        setShowEmtDialog(false)
        setNewEmtNumber('')
      } else {
        const data = await res.json()
        setEmtError(data.error ?? 'Failed to update EMT number')
      }
    } finally {
      setEmtPending(false)
    }
  }

  if (!currentUser || !employee) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }

  const otherEmployees = allEmployees
    .filter(e => e.id !== Number(employeeId))
    .sort(compareEmployeesByLastName)

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={currentUser.name} userRole={currentUser.role} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.push('/employees')}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Back to employees"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Edit Employee</h1>
            <p className="text-sm text-zinc-500 mt-0.5">EMT #{employee.emt_number}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identity */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
            <h2 className="text-base font-semibold text-zinc-100 mb-4">Identity</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className={labelClass}>Full name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="email-username" className={labelClass}>Login username</label>
                  <input
                    id="email-username"
                    type="text"
                    value={emailUsername}
                    onChange={e => setEmailUsername(e.target.value)}
                    className={inputClass}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </div>
                <div>
                  <label htmlFor="email" className={labelClass}>Email <span className="text-zinc-600">(optional)</span></label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelClass.replace('mb-1.5', '')}>EMT number</label>
                  {currentUser.role === 'Dom' && (
                    <button
                      type="button"
                      onClick={() => { setShowEmtDialog(true); setNewEmtNumber(''); setEmtError(''); setEmtSuccess(false) }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Edit EMT Number
                    </button>
                  )}
                </div>
                <div className="px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-500 text-sm">
                  {employee.emt_number}
                </div>
                {emtSuccess && (
                  <p className="text-green-400 text-xs mt-1.5">EMT number updated and logged.</p>
                )}
              </div>
            </div>
          </div>

          {/* Role & credentials */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
            <h2 className="text-base font-semibold text-zinc-100 mb-4">Role &amp; credentials</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="licensure" className={labelClass}>Licensure</label>
                <select id="licensure" value={licensureLevel} onChange={e => setLicensureLevel(e.target.value)} className={inputClass}>
                  <option value="EMT">EMT</option>
                  <option value="EMTA">EMTA</option>
                  <option value="NRP">NRP</option>
                </select>
              </div>
              <div>
                <label htmlFor="role" className={labelClass}>Role</label>
                <select id="role" value={role} onChange={e => setRole(e.target.value)} className={inputClass}>
                  <option value="Employee">Employee</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Admin">Admin</option>
                  <option value="Dom">Dom</option>
                </select>
              </div>
              <div>
                <label htmlFor="status" className={labelClass}>Status</label>
                <select id="status" value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
                  <option value="Active">Active</option>
                  <option value="PRN">PRN</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Shift defaults */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/20">
            <h2 className="text-base font-semibold text-zinc-100 mb-1">Shift defaults</h2>
            <p className="text-sm text-zinc-500 mb-4">Pre-filled when this employee sets up a shift.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="station" className={labelClass}>Default station</label>
                  <select id="station" value={defaultStationId} onChange={e => setDefaultStationId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                    <option value="">No default</option>
                    {stations.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="crew-post" className={labelClass}>Default Shift</label>
                  <select id="crew-post" value={defaultShiftProfileId} onChange={e => setDefaultShiftProfileId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                    <option value="">No default</option>
                    {shiftProfiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.station.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="shift-length" className={labelClass}>Default shift length</label>
                <select id="shift-length" value={defaultShiftLengthHours} onChange={e => setDefaultShiftLengthHours(Number(e.target.value))} className={inputClass}>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                </select>
              </div>
              <div>
                <label htmlFor="partner" className={labelClass}>Default partner</label>
                <select
                  id="partner"
                  value={defaultPartnerId}
                  onChange={e => setDefaultPartnerId(e.target.value ? Number(e.target.value) : '')}
                  className={inputClass}
                >
                  <option value="">No default partner</option>
                  {otherEmployees.map(e => (
                    <option key={e.id} value={e.id}>{formatEmployeeDropdown(e)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-green-400 text-sm">
              Changes saved.
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/employees')}
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

      {/* EMT Number Edit Dialog — Dom only */}
      {showEmtDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold text-zinc-100 mb-1">Change EMT Number</h2>
            <p className="text-zinc-400 text-sm mb-4">
              Current: <span className="text-zinc-200 font-mono">{employee.emt_number}</span>
            </p>
            <p className="text-amber-400 text-xs mb-4">
              This change will be logged in the Change Log. Make sure the new number is correct before saving.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-zinc-300 mb-1.5">New EMT number</label>
              <input
                type="text"
                value={newEmtNumber}
                onChange={e => setNewEmtNumber(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full font-mono"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleEmtSave() }}
              />
            </div>
            {emtError && (
              <p className="text-red-400 text-xs mb-3">{emtError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowEmtDialog(false); setEmtError('') }}
                disabled={emtPending}
                className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 font-semibold rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmtSave}
                disabled={emtPending || !newEmtNumber.trim()}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                {emtPending ? 'Saving…' : 'Save & Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
