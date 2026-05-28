export const LIFECYCLE_PERSISTENT = 'persistent' as const
export const LIFECYCLE_FORFEITABLE = 'forfeitable' as const

export type Lifecycle = typeof LIFECYCLE_PERSISTENT | typeof LIFECYCLE_FORFEITABLE

export function isPersistent(t: { lifecycle: string }): boolean {
  return t.lifecycle === LIFECYCLE_PERSISTENT
}

export function isForfeitable(t: { lifecycle: string }): boolean {
  return t.lifecycle === LIFECYCLE_FORFEITABLE
}
