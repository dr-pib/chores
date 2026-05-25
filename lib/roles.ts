import type { Role } from '@/lib/types'

export const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor'] as const

export const DOM_ROLE = 'Dom' as const

export function isSupervisorRole(role: string): role is 'Dom' | 'Admin' | 'Supervisor' {
  return (SUPERVISOR_ROLES as readonly string[]).includes(role)
}

export function isDom(role: string): role is 'Dom' {
  return role === DOM_ROLE
}

// Alias for guard-at-route level; branching on specific roles can use isSupervisorRole/isDom.
export function canAccessAdmin(role: string): boolean {
  return isSupervisorRole(role)
}

// Narrowing helper when you already have a typed Role value.
export function isSupervisorTyped(role: Role): role is 'Dom' | 'Admin' | 'Supervisor' {
  return isSupervisorRole(role)
}
