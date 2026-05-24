'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'

interface Employee {
  id: number
  name: string
  email_username: string
  licensure_level: string
  role: string
  status: string
  default_partner_id: number | null
  default_shift_length_hours: number | null
  direct_supervisor_id: number | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function lastFirst(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return name
  const last = parts[parts.length - 1]
  const first = parts.slice(0, -1).join(' ')
  return `${last}, ${first}`
}

function byLastName(a: Employee, b: Employee) {
  const aLast = a.name.trim().split(/\s+/).at(-1) ?? ''
  const bLast = b.name.trim().split(/\s+/).at(-1) ?? ''
  return aLast.localeCompare(bLast) || a.name.localeCompare(b.name)
}

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
const NEEDS_DEFAULTS = ['Active', 'PRN']

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') return <span className="text-zinc-500 text-xs">…</span>
  if (state === 'saved') return <span className="text-green-400 text-base leading-none">✓</span>
  if (state === 'error') return <span className="text-red-400 text-xs">!</span>
  return null
}

export default function EmployeeGridPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [partners, setPartners] = useState<Record<number, number | ''>>({})
  const [shifts, setShifts] = useState<Record<number, number | ''>>({})
  const [supervisors, setSupervisors] = useState<Record<number, number | ''>>({})
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/employees?all=true').then(r => r.json()),
    ]).then(([meData, empsData]) => {
      if (!meData.user) { router.push('/login'); return }
      if (!SUPERVISOR_ROLES.includes(meData.user.role)) { router.push('/setup'); return }
      setCurrentUser(meData.user)
      const emps: Employee[] = Array.isArray(empsData) ? empsData : []
      setEmployees(emps)
      const initPartners: Record<number, number | ''> = {}
      const initShifts: Record<number, number | ''> = {}
      const initSupervisors: Record<number, number | ''> = {}
      emps.forEach(e => {
        initPartners[e.id] = e.default_partner_id ?? ''
        initShifts[e.id] = e.default_shift_length_hours ?? ''
        initSupervisors[e.id] = e.direct_supervisor_id ?? ''
      })
      setPartners(initPartners)
      setShifts(initShifts)
      setSupervisors(initSupervisors)
      setLoading(false)
    })
  }, [router])

  async function autoSave(
    employeeId: number,
    patch: { default_partner_id?: number | null; default_shift_length_hours?: number | null; direct_supervisor_id?: number | null },
  ) {
    setSaveStates(s => ({ ...s, [employeeId]: 'saving' }))
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      if ('default_partner_id' in patch) {
        const updated = await res.json()
        const newPartnerId = updated.default_partner_id ?? ''
        setPartners(prev => {
          const next = { ...prev, [employeeId]: newPartnerId }
          if (newPartnerId) next[newPartnerId as number] = employeeId
          return next
        })
      }
      setSaveStates(s => ({ ...s, [employeeId]: 'saved' }))
      setTimeout(() => setSaveStates(s => ({ ...s, [employeeId]: 'idle' })), 2000)
    } else {
      setSaveStates(s => ({ ...s, [employeeId]: 'error' }))
      setTimeout(() => setSaveStates(s => ({ ...s, [employeeId]: 'idle' })), 3000)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }
  if (!currentUser) return null

  const partnerEligible = employees
    .filter(e => e.status === 'Active' && e.role !== 'Admin')
    .sort(byLastName)

  const supervisorOptions = employees
    .filter(e => SUPERVISOR_ROLES.includes(e.role))
    .sort(byLastName)

  const activeEmployees = employees.filter(e => e.status === 'Active').sort(byLastName)
  const prn = employees.filter(e => e.status === 'PRN').sort(byLastName)
  const inactive = employees.filter(e => e.status === 'Inactive').sort(byLastName)

  function selectClass(alert: boolean) {
    const border = alert ? 'border-red-700' : 'border-zinc-700'
    return `px-2 py-1.5 bg-zinc-800 border ${border} rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full`
  }

  function renderGroup(label: string, group: Employee[]) {
    if (group.length === 0) return null
    const needsDefaults = NEEDS_DEFAULTS.includes(label)
    return (
      <div key={label}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
          {group.map(emp => {
            const partnerChoices = partnerEligible.filter(e => e.id !== emp.id)
            const shiftMissing = needsDefaults && !shifts[emp.id]
            const supervisorMissing = needsDefaults && !supervisors[emp.id]
            return (
              <div key={emp.id} className="flex items-center gap-3 px-4 py-2">
                <div className="w-56 shrink-0">
                  <span className="text-sm text-zinc-100">{lastFirst(emp.name)}</span>
                  <span className="ml-2 text-xs text-zinc-600">{emp.licensure_level}</span>
                </div>
                <div className="w-28 shrink-0">
                  <select
                    value={shifts[emp.id] ?? ''}
                    onChange={e => {
                      const val = e.target.value !== '' ? Number(e.target.value) : ''
                      setShifts(prev => ({ ...prev, [emp.id]: val }))
                      autoSave(emp.id, { default_shift_length_hours: val !== '' ? val : null })
                    }}
                    className={selectClass(shiftMissing)}
                  >
                    <option value="">N/A</option>
                    <option value={24}>24 hours</option>
                    <option value={48}>48 hours</option>
                  </select>
                </div>
                <div className="w-56 shrink-0">
                  <select
                    value={partners[emp.id] ?? ''}
                    onChange={e => {
                      const val = e.target.value ? Number(e.target.value) : ''
                      setPartners(prev => ({ ...prev, [emp.id]: val }))
                      autoSave(emp.id, { default_partner_id: val || null })
                    }}
                    className={selectClass(false)}
                  >
                    <option value="">N/A</option>
                    {partnerChoices.map(p => (
                      <option key={p.id} value={p.id}>{lastFirst(p.name)} ({p.licensure_level})</option>
                    ))}
                  </select>
                </div>
                <div className="w-44 shrink-0">
                  <select
                    value={supervisors[emp.id] ?? ''}
                    onChange={e => {
                      const val = e.target.value ? Number(e.target.value) : ''
                      setSupervisors(prev => ({ ...prev, [emp.id]: val }))
                      autoSave(emp.id, { direct_supervisor_id: val || null })
                    }}
                    className={selectClass(supervisorMissing)}
                  >
                    <option value="">N/A</option>
                    {supervisorOptions.map(s => (
                      <option key={s.id} value={s.id}>{lastFirst(s.name)}</option>
                    ))}
                  </select>
                </div>
                <div className="w-4 shrink-0 flex items-center justify-center">
                  <SaveIndicator state={saveStates[emp.id] ?? 'idle'} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={currentUser.name} userRole={currentUser.role} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/employees" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Employee Grid</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Changes save automatically</p>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <div className="w-56 shrink-0">Employee</div>
          <div className="w-28 shrink-0">Default Shift</div>
          <div className="w-56 shrink-0">Default Partner</div>
          <div className="w-44 shrink-0">Direct Supervisor</div>
          <div className="w-4 shrink-0" />
        </div>

        <div className="space-y-6">
          {renderGroup('Active', activeEmployees)}
          {renderGroup('PRN', prn)}
          {renderGroup('Inactive', inactive)}
        </div>
      </div>
    </div>
  )
}
