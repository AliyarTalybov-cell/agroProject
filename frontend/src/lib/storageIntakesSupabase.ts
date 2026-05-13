import { supabase } from '@/lib/supabase'
import { recalculateStorageBatchTotals } from '@/lib/storageBatchesSupabase'
import { syncStorageLocationFillStatusFromIntakes } from '@/lib/storageLocationsSupabase'

export type StorageIntakeRow = {
  id: string
  storage_location_id: string
  received_at: string
  field_id: string | null
  crop_key: string | null
  gross_mass_tons: number
  moisture_percent: number
  net_mass_tons: number
  comment: string | null
  batch_code: string | null
  batch_id: string | null
  created_at: string
  updated_at: string
  fields?: { id: string; number: number; name: string } | { id: string; number: number; name: string }[] | null
  crops?: { key: string; label: string } | { key: string; label: string }[] | null
}

const STORAGE_INTAKES_TABLE = 'storage_intakes'
const STORAGE_INTAKES_SELECT =
  'id, storage_location_id, received_at, field_id, crop_key, gross_mass_tons, moisture_percent, net_mass_tons, comment, batch_code, batch_id, created_at, updated_at, fields ( id, number, name ), crops ( key, label )'

export async function loadStorageIntakes(storageLocationId: string): Promise<StorageIntakeRow[]> {
  if (!supabase || !storageLocationId) return []
  const { data, error } = await supabase
    .from(STORAGE_INTAKES_TABLE)
    .select(STORAGE_INTAKES_SELECT)
    .eq('storage_location_id', storageLocationId)
    .order('received_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StorageIntakeRow[]
}

export async function addStorageIntake(payload: {
  storage_location_id: string
  received_at: string
  field_id: string | null
  crop_key: string | null
  gross_mass_tons: number
  moisture_percent: number
  net_mass_tons: number
  comment?: string | null
}): Promise<StorageIntakeRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { data, error } = await supabase
    .from(STORAGE_INTAKES_TABLE)
    .insert({
      storage_location_id: payload.storage_location_id,
      received_at: payload.received_at,
      field_id: payload.field_id,
      crop_key: payload.crop_key,
      gross_mass_tons: payload.gross_mass_tons,
      moisture_percent: payload.moisture_percent,
      net_mass_tons: payload.net_mass_tons,
      comment: payload.comment?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select(STORAGE_INTAKES_SELECT)
    .single()
  if (error) throw error
  return data as StorageIntakeRow
}

export async function attachStorageIntakesToBatch(payload: {
  storageLocationId: string
  batchId: string
  batchCode: string
  intakeIds: string[]
}): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  if (!payload.intakeIds.length) return
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from(STORAGE_INTAKES_TABLE)
    .update({ batch_id: payload.batchId, batch_code: payload.batchCode, updated_at: nowIso })
    .in('id', payload.intakeIds)
    .eq('storage_location_id', payload.storageLocationId)
    .is('batch_id', null)
  if (error) throw error
  await recalculateStorageBatchTotals(payload.batchId)
  const { data: rows, error: re } = await supabase
    .from(STORAGE_INTAKES_TABLE)
    .select('batch_id')
    .eq('storage_location_id', payload.storageLocationId)
  if (re) throw re
  await syncStorageLocationFillStatusFromIntakes(payload.storageLocationId, (rows ?? []) as { batch_id: string | null }[])
}

export async function detachStorageIntakeFromBatch(payload: {
  intakeId: string
  storageLocationId: string
  batchId: string
}): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from(STORAGE_INTAKES_TABLE)
    .update({ batch_id: null, batch_code: null, updated_at: nowIso })
    .eq('id', payload.intakeId)
    .eq('storage_location_id', payload.storageLocationId)
    .eq('batch_id', payload.batchId)
  if (error) throw error
  await recalculateStorageBatchTotals(payload.batchId)
  const { data: rows, error: re } = await supabase
    .from(STORAGE_INTAKES_TABLE)
    .select('batch_id')
    .eq('storage_location_id', payload.storageLocationId)
  if (re) throw re
  await syncStorageLocationFillStatusFromIntakes(payload.storageLocationId, (rows ?? []) as { batch_id: string | null }[])
}

function coalesceFieldJoin(row: StorageIntakeRow): { id: string; number: number; name: string } | null {
  const x = row.fields
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

function coalesceCropJoin(row: StorageIntakeRow): { key: string; label: string } | null {
  const x = row.crops
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

export function storageIntakeFieldLabel(row: StorageIntakeRow): string {
  const f = coalesceFieldJoin(row)
  if (!f) return '—'
  return `Поле №${f.number} (${f.name})`
}

export function storageIntakeCropLabel(row: StorageIntakeRow): string {
  return coalesceCropJoin(row)?.label || '—'
}
