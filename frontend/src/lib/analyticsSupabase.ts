import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { StoredDowntime } from '@/lib/downtimeStorage'
import type { StoredOperation } from '@/lib/operationStorage'

export type DowntimeRow = {
  id: number
  user_id: string | null
  employee: string
  reason: string
  category: string
  start_iso: string
  end_iso: string
  duration_minutes: number
  field_id: string | null
  field_name: string | null
  operation: string | null
  notes: string | null
}

export type OperationRow = {
  id: number
  user_id: string | null
  employee: string
  field_id: string | null
  field_name: string | null
  operation: string | null
  start_iso: string
  end_iso: string
  duration_minutes: number
  notes: string | null
  equipment_id?: string | null
  equipment_fuel_percent?: number | null
  equipment_condition_value?: number | null
  equipment_condition_label?: string | null
  equipment_repair_notes?: string | null
}

export type EquipmentOperationHistoryRow = {
  id: number
  employee: string
  operation: string | null
  startISO: string
  endISO: string
  durationMinutes: number
  equipmentId?: string | null
  equipmentFuelPercent?: number | null
  equipmentConditionValue?: number | null
  equipmentConditionLabel?: string | null
  equipmentRepairNotes?: string | null
  fieldName?: string | null
}

function rowToDowntime(r: DowntimeRow): StoredDowntime {
  return {
    id: r.id,
    employee: r.employee,
    reason: r.reason,
    category: r.category as StoredDowntime['category'],
    startISO: r.start_iso,
    endISO: r.end_iso,
    durationMinutes: r.duration_minutes,
    fieldId: r.field_id ?? undefined,
    fieldName: r.field_name ?? undefined,
    operation: r.operation ?? undefined,
    notes: r.notes ?? undefined,
  }
}

function rowToOperation(r: OperationRow): StoredOperation {
  return {
    id: r.id,
    employee: r.employee,
    fieldId: r.field_id ?? undefined,
    fieldName: r.field_name ?? undefined,
    operation: r.operation ?? undefined,
    startISO: r.start_iso,
    endISO: r.end_iso,
    durationMinutes: r.duration_minutes,
    notes: r.notes ?? undefined,
    equipmentId: r.equipment_id ?? undefined,
    equipmentFuelPercent: r.equipment_fuel_percent ?? undefined,
    equipmentConditionValue: r.equipment_condition_value ?? undefined,
    equipmentConditionLabel: r.equipment_condition_label ?? undefined,
    equipmentRepairNotes: r.equipment_repair_notes ?? undefined,
  }
}

export async function insertDowntime(
  event: StoredDowntime,
  userId: string | null,
): Promise<void> {
  if (!supabase) return
  await supabase.from('downtimes').insert({
    user_id: userId,
    employee: event.employee,
    reason: event.reason,
    category: event.category,
    start_iso: event.startISO,
    end_iso: event.endISO,
    duration_minutes: event.durationMinutes,
    field_id: event.fieldId ?? null,
    field_name: event.fieldName ?? null,
    operation: event.operation ?? null,
    notes: event.notes?.trim() || null,
  })
}

export async function insertOperation(
  op: StoredOperation,
  userId: string | null,
): Promise<void> {
  if (!supabase) return
  const basePayload = {
    user_id: userId,
    employee: op.employee,
    field_id: op.fieldId ?? null,
    field_name: op.fieldName ?? null,
    operation: op.operation ?? null,
    start_iso: op.startISO,
    end_iso: op.endISO,
    duration_minutes: op.durationMinutes,
    notes: op.notes?.trim() || null,
  }

  const payloadWithEquipment = {
    ...basePayload,
    equipment_id: op.equipmentId ?? null,
    equipment_fuel_percent: op.equipmentFuelPercent ?? null,
    equipment_condition_value: op.equipmentConditionValue ?? null,
    equipment_condition_label: op.equipmentConditionLabel ?? null,
    equipment_repair_notes: op.equipmentRepairNotes?.trim() || null,
  }

  try {
    await supabase.from('operations').insert(payloadWithEquipment)
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    const isColumnError = err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '')
    if (!isColumnError) throw e
    // Если бекенд/БД ещё не содержит колонок под технику — пишем только базовые поля.
    await supabase.from('operations').insert(basePayload)
  }
}

export async function loadDowntimesFromSupabase(
  onlyCurrentUser: boolean,
  userId: string | null,
): Promise<StoredDowntime[]> {
  if (!supabase) return []
  let q = supabase
    .from('downtimes')
    .select('id, user_id, employee, reason, category, start_iso, end_iso, duration_minutes, field_id, field_name, operation, notes')
    .order('start_iso', { ascending: false })
  if (onlyCurrentUser && userId) {
    q = q.eq('user_id', userId)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => rowToDowntime(r as DowntimeRow))
}

export async function loadOperationsFromSupabase(
  onlyCurrentUser: boolean,
  userId: string | null,
): Promise<StoredOperation[]> {
  if (!supabase) return []
  const sb = supabase
  const baseSelect = 'id, user_id, employee, field_id, field_name, operation, start_iso, end_iso, duration_minutes, notes'
  const extraSelect =
    'equipment_id, equipment_fuel_percent, equipment_condition_value, equipment_condition_label, equipment_repair_notes'

  const attempt = async (select: string): Promise<StoredOperation[]> => {
    let q = sb
      .from('operations')
      .select(select)
      .order('start_iso', { ascending: false })
    if (onlyCurrentUser && userId) q = q.eq('user_id', userId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => rowToOperation(r as unknown as OperationRow))
  }

  try {
    return await attempt(`${baseSelect}, ${extraSelect}`)
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    const isColumnError = err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '')
    if (!isColumnError) throw e
    return attempt(baseSelect)
  }
}

export async function loadOperationsByEquipmentFromSupabase(
  equipmentId: string,
  onlyCurrentUser: boolean,
  userId: string | null,
): Promise<EquipmentOperationHistoryRow[]> {
  if (!supabase) return []

  const sb = supabase
  const baseSelect = 'id, user_id, employee, field_name, operation, start_iso, end_iso, duration_minutes'
  const extraSelect =
    'equipment_id, equipment_fuel_percent, equipment_condition_value, equipment_condition_label, equipment_repair_notes'

  const attempt = async (select: string): Promise<EquipmentOperationHistoryRow[]> => {
    let q = sb
      .from('operations')
      .select(select)
      .eq('equipment_id', equipmentId)
      .order('start_iso', { ascending: false })

    if (onlyCurrentUser && userId) q = q.eq('user_id', userId)

    const { data, error } = await q
    if (error) throw error

    return (data ?? []).map((r: any) => ({
      id: r.id as number,
      employee: r.employee as string,
      operation: (r.operation ?? null) as string | null,
      startISO: r.start_iso as string,
      endISO: r.end_iso as string,
      durationMinutes: r.duration_minutes as number,
      equipmentId: r.equipment_id ?? undefined,
      equipmentFuelPercent: r.equipment_fuel_percent ?? undefined,
      equipmentConditionValue: r.equipment_condition_value ?? undefined,
      equipmentConditionLabel: r.equipment_condition_label ?? undefined,
      equipmentRepairNotes: r.equipment_repair_notes ?? undefined,
      fieldName: r.field_name ?? undefined,
    }))
  }

  try {
    return await attempt(`${baseSelect}, ${extraSelect}`)
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    const isColumnError = err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '')
    if (!isColumnError) throw e
    return attempt(baseSelect)
  }
}

export { isSupabaseConfigured }
