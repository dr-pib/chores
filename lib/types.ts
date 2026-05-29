export type UnitStatus = 'unit_present' | 'empty_bay' | 'unit_at_shop'
export type ChoreStatus = 'pending' | 'completed' | 'skipped'
export type LogStatus = 'confirmed'
export type Role = 'Dom' | 'Admin' | 'Supervisor' | 'Employee'
export type LicensureLevel = 'EMT' | 'EMTA' | 'NRP'
export type EmployeeStatus = 'Active' | 'PRN' | 'Inactive'
export type LifecycleType = 'daily_reset' | 'persistent_until_complete'

export interface BayInput {
  bay_label: string
  unit_id: number | null
  unit_status: UnitStatus
  sort_order: number
}

export interface SetShiftInput {
  shift_profile_id: number
  partner_employee_id: number | null
  primary_unit_id: number
  actual_start: string // ISO datetime
  actual_end: string   // ISO datetime
  narc_box_id: number | null
  bays: BayInput[]
  // Supervisor edit mode: target a specific log instead of the session user's active shift
  supervisor_log_id?: number
  primary_employee_id?: number
}
