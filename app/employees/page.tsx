'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import EmployeeEditPanel from '@/components/EmployeeEditPanel'
import { compareEmployeesByLastName, formatEmployeeDropdown } from '@/lib/employees'
import { isSupervisorRole } from '@/lib/roles'

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

export default function EmployeesPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/employees?all=true').then(r => r.json()),
    ]).then(([meData, empsData]) => {
      if (!meData.user) { router.push('/login'); return }
      const role = meData.user.role
      if (!isSupervisorRole(role)) { router.push('/setup'); return }
      setUser(meData.user)
      setEmployees(Array.isArray(empsData) ? empsData : [])
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }
  if (!user) return null

  const byStatus = (s: string) => employees.filter(e => e.status === s).sort(compareEmployeesByLastName)
  const groups = [
    { label: 'Active', employees: byStatus('Active') },
    { label: 'PRN', employees: byStatus('PRN') },
    { label: 'Inactive', employees: byStatus('Inactive') },
  ].filter(g => g.employees.length > 0)

  function handleRowClick(id: number) {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSelectedId(id)
    } else {
      router.push(`/employees/${id}/edit`)
    }
  }

  return (
    <div className="bg-zinc-950 min-h-screen">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="lg:flex lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">

        {/* Left: list */}
        <div className="lg:w-[36rem] lg:flex-shrink-0 lg:border-r lg:border-zinc-800 lg:overflow-y-auto">
          <div className="px-4 py-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-zinc-100">Employees</h1>
                <p className="mt-1 text-sm text-zinc-500">{employees.length} total</p>
              </div>
              <Link
                href="/employees/partners"
                className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Employee Grid
              </Link>
            </div>

            <div className="space-y-6">
              {groups.map(group => (
                <div key={group.label}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</h2>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
                    {group.employees.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => handleRowClick(emp.id)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/60 transition-colors ${selectedId === emp.id ? 'bg-zinc-800/80 border-l-2 border-blue-500' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-zinc-100 truncate">{formatEmployeeDropdown(emp)}</div>
                          <div className="text-xs text-zinc-500 truncate">{emp.email_username} · #{emp.emt_number}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-medium ${STATUS_COLORS[emp.status] ?? 'text-zinc-400'}`}>{emp.status}</span>
                          <svg className="w-3.5 h-3.5 text-zinc-600 lg:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: detail panel — large screens only */}
        <div className="hidden lg:flex lg:flex-1 lg:overflow-y-auto">
          {selectedId ? (
            <EmployeeEditPanel key={selectedId} employeeId={selectedId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              Click an employee on the left to edit.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
