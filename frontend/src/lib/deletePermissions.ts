import { getAuthUser } from '@/stores/auth'

const DELETE_FORBIDDEN_MESSAGE = 'У вас недостаточно прав для удаления.'

function isManagerRole(role: unknown): boolean {
  return String(role ?? '').toLowerCase() === 'manager'
}

export function canCurrentUserDelete(): boolean {
  const user = getAuthUser()
  if (!user) return false
  const meta = user.user_metadata ?? {}
  const appMeta = user.app_metadata ?? {}
  return isManagerRole(meta.role) || isManagerRole(appMeta.role)
}

export function assertCanDelete(): void {
  if (!canCurrentUserDelete()) {
    throw new Error(DELETE_FORBIDDEN_MESSAGE)
  }
}

