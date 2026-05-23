'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'

interface Employee {
  id: number
  name: string
  email_username: string
  emt_number: string
  licensure_level: string
  role: string
  status: string
  default_shift_length_hours: number
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'text-green-400',
  PRN: 'text-yellow-400',
  Inactive: 'text-zinc-500',
}

function lastFirst(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return name
  const last = parts[parts.length - 1]
  const first = parts.slice(0, -1).join(' ')
  return `${last}, ${first}`
}

function sortByLastName(a: Employee, b: Employee) {
  const aLast = a.name.trim().split(/\s+/).at(-1) ?? ''
  const bLast = b.name.trim().split(/\s+/).at(-1) ?? ''
  return aLast.localeCompare(bLast) || a.name.localeCompare(b.name)
}

export default function EmployeesPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/employees?all=true').then(r => r.json()),
    ]).then(([meData, empsData]) => {
      if (!meData.user) { router.push('/login'); return }
      const role = meData.user.role
      if (!['Dom', 'Admin', 'Supervisor'].includes(role)) { router.push('/setup'); return }
      setUser(meData.user)
      setEmployees(Array.isArray(empsData) ? empsData : [])
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }

  if (!user) return null

  const byStatus = (s: string) => employees.filter(e => e.status === s).sort(sortByLastName)
  const groups = [
    { label: 'Active', employees: byStatus('Active') },
    { label: 'PRN', employees: byStatus('PRN') },
    { label: 'Inactive', employees: byStatus('Inactive') },
  ].filter(g => g.employees.length > 0)

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Employees</h1>
          <p className="mt-1 text-sm text-zinc-500">{employees.length} total · click a row to edit</p>
        </div>

        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</h2>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
                {group.employees.map(emp => (
                  <Link
                    key={emp.id}
                    href={`/employees/${emp.id}/edit`}
                    className="flex items-center gap-4 px-5 py-1 hover:bg-zinc-800/60 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-zinc-100">{lastFirst(emp.name)}</span>
                      <span className="ml-2 text-xs text-zinc-500">{emp.email_username}</span>
                      <span className="ml-2 text-xs text-zinc-600">#{emp.emt_number}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">{emp.licensure_level}</span>
                      <span className="text-xs text-zinc-400">{emp.role}</span>
                      <span className={`text-xs font-medium ${STATUS_COLORS[emp.status] ?? 'text-zinc-400'}`}>{emp.status}</span>
                      <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
