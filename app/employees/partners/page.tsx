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
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function lastFirst(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return name
  const last = parts[parts.length - 1]
  const first = parts.slice(0, -1).join(' ')
  return `${last}, ${first}`
}

export default function PartnersPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [partners, setPartners] = useState<Record<number, number | ''>>({})
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/employees?all=true').then(r => r.json()),
    ]).then(([meData, empsData]) => {
      if (!meData.user) { router.push('/login'); return }
      if (!['Dom', 'Admin', 'Supervisor'].includes(meData.user.role)) { router.push('/setup'); return }
      setCurrentUser(meData.user)
      const emps: Employee[] = Array.isArray(empsData) ? empsData : []
      setEmployees(emps)
      const initial: Record<number, number | ''> = {}
      emps.forEach(e => { initial[e.id] = e.default_partner_id ?? '' })
      setPartners(initial)
      setLoading(false)
    })
  }, [router])

  async function savePartner(employeeId: number) {
    setSaveStates(s => ({ ...s, [employeeId]: 'saving' }))
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_partner_id: partners[employeeId] || null }),
    })
    if (res.ok) {
      // The API mirrors the partner relationship — refresh the partner map to reflect that
      const updated = await res.json()
      const newPartnerId = updated.default_partner_id ?? ''
      setPartners(prev => {
        const next = { ...prev, [employeeId]: newPartnerId }
        // If the partner was updated to point back at this employee, reflect that too
        if (newPartnerId) {
          next[newPartnerId as number] = employeeId
        }
        return next
      })
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

  function byLastName(a: Employee, b: Employee) {
    const aLast = a.name.trim().split(/\s+/).at(-1) ?? ''
    const bLast = b.name.trim().split(/\s+/).at(-1) ?? ''
    return aLast.localeCompare(bLast) || a.name.localeCompare(b.name)
  }

  const CREW_ROLES = ['Employee']
  const ADMIN_ROLES = ['Dom', 'Admin', 'Supervisor']

  const activeCrewMembers = employees.filter(e => e.status === 'Active' && CREW_ROLES.includes(e.role)).sort(byLastName)
  const prn = employees.filter(e => e.status === 'PRN').sort(byLastName)
  const admins = employees.filter(e => e.status === 'Active' && ADMIN_ROLES.includes(e.role)).sort(byLastName)

  const inputClass = 'px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  function renderGroup(label: string, group: Employee[]) {
    if (group.length === 0) return null
    return (
      <div key={label}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
          {group.map(emp => {
            const state = saveStates[emp.id] ?? 'idle'
            const otherEmps = employees
              .filter(e => e.id !== emp.id && e.status !== 'Inactive')
              .sort((a, b) => {
                const aLast = a.name.trim().split(/\s+/).at(-1) ?? ''
                const bLast = b.name.trim().split(/\s+/).at(-1) ?? ''
                return aLast.localeCompare(bLast) || a.name.localeCompare(b.name)
              })
            return (
              <div key={emp.id} className="flex items-center gap-3 px-4 py-2">
                <div className="w-48 shrink-0">
                  <span className="text-sm text-zinc-100">{lastFirst(emp.name)}</span>
                  <span className="ml-2 text-xs text-zinc-600">{emp.licensure_level}</span>
                </div>
                <div className="flex-1">
                  <select
                    value={partners[emp.id] ?? ''}
                    onChange={e => setPartners(prev => ({ ...prev, [emp.id]: e.target.value ? Number(e.target.value) : '' }))}
                    className={inputClass}
                  >
                    <option value="">No default partner</option>
                    {otherEmps.map(p => (
                      <option key={p.id} value={p.id}>{lastFirst(p.name)} ({p.licensure_level})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => savePartner(emp.id)}
                  disabled={state === 'saving'}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    state === 'saved'  ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    state === 'error'  ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    state === 'saving' ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' :
                                        'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                  }`}
                >
                  {state === 'saving' ? '…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Error' : 'Save'}
                </button>
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
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/employees" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Default Partners</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Setting one side automatically updates the other</p>
          </div>
        </div>

        <div className="space-y-6">
          {renderGroup('Active', activeCrewMembers)}
          {renderGroup('PRN', prn)}
          {renderGroup('Admin / Supervisors', admins)}
        </div>
      </div>
    </div>
  )
}
