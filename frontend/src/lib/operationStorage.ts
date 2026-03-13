export type StoredOperation = {
  id: number
  employee: string
  fieldId?: string
  fieldName?: string
  operation?: string
  startISO: string
  endISO: string
  durationMinutes: number
}

export type ActiveOperation = {
  startISO: string
  fieldId?: string
  fieldName?: string
  operation?: string
  employee: string
}

const OPERATIONS_KEY = 'agro_ctrl:operations'
const ACTIVE_OPERATION_KEY = 'agro_ctrl:active_operation'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadOperations(): StoredOperation[] {
  if (!isBrowser()) return []
  const raw = window.localStorage.getItem(OPERATIONS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as StoredOperation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveOperations(operations: StoredOperation[]) {
  if (!isBrowser()) return
  window.localStorage.setItem(OPERATIONS_KEY, JSON.stringify(operations))
}

export function appendOperation(event: StoredOperation) {
  const existing = loadOperations()
  existing.push(event)
  saveOperations(existing)
}

export function loadActiveOperation(): ActiveOperation | null {
  if (!isBrowser()) return null
  const raw = window.localStorage.getItem(ACTIVE_OPERATION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ActiveOperation
    return parsed?.startISO ? parsed : null
  } catch {
    return null
  }
}

export function saveActiveOperation(active: ActiveOperation | null) {
  if (!isBrowser()) return
  if (!active) {
    window.localStorage.removeItem(ACTIVE_OPERATION_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_OPERATION_KEY, JSON.stringify(active))
}
