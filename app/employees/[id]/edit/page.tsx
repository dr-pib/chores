'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import NavBar from '@/components/NavBar'

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
  default_crew_post_id: number | null
  default_shift_length_hours: number
  default_partner_id: number | null
  default_partner: { id: number; name: string } | null
}

interface Station { id: number; name: string }
interface CrewPost { id: number; name: string; station: { name: string } }
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
  const [crewPosts, setCrewPosts] = useState<CrewPost[]>([])
  const [allEmployees, setAllEmployees] = useState<EmployeeSummary[]>([])

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailUsername, setEmailUsername] = useState('')
  const [licensureLevel, setLicensureLevel] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [defaultStationId, setDefaultStationId] = useState<number | ''>('')
  const [defaultCrewPostId, setDefaultCrewPostId] = useState<number | ''>('')
  const [defaultShiftLengthHours, setDefaultShiftLengthHours] = useState(24)
  const [defaultPartnerId, setDefaultPartnerId] = useState<number | ''>('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch(`/api/employees/${employeeId}`).then(r => r.json()),
      fetch('/api/stations').then(r => r.json()),
      fetch('/api/crew-posts').then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
    ]).then(([meData, empData, stationsData, postsData, empsData]) => {
      if (!meData.user) { router.push('/login'); return }
      const userRole = meData.user.role
      if (!['Dom', 'Admin', 'Supervisor'].includes(userRole)) { router.push('/roster'); return }
      if (empData.error) { router.push('/employees'); return }

      setCurrentUser(meData.user)
      setEmployee(empData)
      setStations(Array.isArray(stationsData) ? stationsData : [])
      setCrewPosts(Array.isArray(postsData) ? postsData : [])
      setAllEmployees(Array.isArray(empsData) ? empsData : [])

      setName(empData.name)
      setEmail(empData.email ?? '')
      setEmailUsername(empData.email_username)
      setLicensureLevel(empData.licensure_level)
      setRole(empData.role)
      setStatus(empData.status)
      setDefaultStationId(empData.default_station_id ?? '')
      setDefaultCrewPostId(empData.default_crew_post_id ?? '')
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
          default_crew_post_id: defaultCrewPostId || null,
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

  if (!currentUser || !employee) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }

  const otherEmployees = allEmployees.filter(e => e.id !== Number(employeeId))

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
                <label className={labelClass}>EMT number <span className="text-zinc-600">(not editable)</span></label>
                <div className="px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-500 text-sm">
                  {employee.emt_number}
                </div>
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
                  <label htmlFor="crew-post" className={labelClass}>Default crew post</label>
                  <select id="crew-post" value={defaultCrewPostId} onChange={e => setDefaultCrewPostId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                    <option value="">No default</option>
                    {crewPosts.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.station.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="shift-length" className={labelClass}>Default shift length</label>
                <select id="shift-length" value={defaultShiftLengthHours} onChange={e => setDefaultShiftLengthHours(Number(e.target.value))} className={inputClass}>
                  <option value={8}>8 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
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
                    <option key={e.id} value={e.id}>{e.name} ({e.licensure_level})</option>
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
    </div>
  )
}
