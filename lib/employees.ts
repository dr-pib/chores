export interface EmployeeName {
  name: string
  licensure_level?: string | null
}

export function lastFirstName(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return name
  const last = parts[parts.length - 1]
  const first = parts.slice(0, -1).join(' ')
  return `${last}, ${first}`
}

export function formatEmployeeTitle(employee: EmployeeName) {
  return employee.licensure_level
    ? `${employee.name}, ${employee.licensure_level}`
    : employee.name
}

export function formatEmployeeDropdown(employee: EmployeeName) {
  const name = lastFirstName(employee.name)
  return employee.licensure_level
    ? `${name}, ${employee.licensure_level}`
    : name
}

export function compareEmployeesByLastName(a: EmployeeName, b: EmployeeName) {
  const aLast = a.name.trim().split(/\s+/).at(-1) ?? ''
  const bLast = b.name.trim().split(/\s+/).at(-1) ?? ''
  return aLast.localeCompare(bLast) || a.name.localeCompare(b.name)
}
