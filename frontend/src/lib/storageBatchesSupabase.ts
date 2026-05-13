import { supabase } from '@/lib/supabase'
import { syncStorageLocationFillStatusFromIntakes } from '@/lib/storageLocationsSupabase'

export type StorageBatchRow = {
  id: string
  code: string
  storage_location_id: string
  crop_key: string | null
  purpose: string
  use_goal: string
  quality: Record<string, unknown>
  total_net_tons: number
  created_at: string
  updated_at: string
  completed_at: string | null
  crops?: { key: string; label: string } | { key: string; label: string }[] | null
}

const STORAGE_BATCHES_TABLE = 'storage_batches'
const STORAGE_BATCHES_SELECT =
  'id, code, storage_location_id, crop_key, purpose, use_goal, quality, total_net_tons, created_at, updated_at, completed_at, crops ( key, label )'

function coalesceCropJoin(row: StorageBatchRow): { key: string; label: string } | null {
  const x = row.crops
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

export function storageBatchCropLabel(row: StorageBatchRow): string {
  return coalesceCropJoin(row)?.label ?? '—'
}

export async function loadStorageBatches(storageLocationId: string): Promise<StorageBatchRow[]> {
  if (!supabase || !storageLocationId) return []
  const { data, error } = await supabase
    .from(STORAGE_BATCHES_TABLE)
    .select(STORAGE_BATCHES_SELECT)
    .eq('storage_location_id', storageLocationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as StorageBatchRow[]).map((r) => ({
    ...r,
    completed_at: r.completed_at ?? null,
  }))
}

function nextBatchCode(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `П-${y}${m}${d}-${hh}${mm}-${rand}`
}

/** Пересчёт total_net_tons партии по привязанным поступлениям. */
export async function recalculateStorageBatchTotals(batchId: string): Promise<void> {
  if (!supabase || !batchId) return
  const { data, error } = await supabase.from('storage_intakes').select('net_mass_tons').eq('batch_id', batchId)
  if (error) throw error
  const total = (data ?? []).reduce((s, r: { net_mass_tons: number }) => s + Number(r.net_mass_tons || 0), 0)
  const nowIso = new Date().toISOString()
  const { error: up } = await supabase
    .from(STORAGE_BATCHES_TABLE)
    .update({ total_net_tons: Number(total.toFixed(2)), updated_at: nowIso })
    .eq('id', batchId)
  if (up) throw up
}

export async function completeStorageBatch(batchId: string, storageLocationId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const nowIso = new Date().toISOString()
  const { error } = await supabase.from(STORAGE_BATCHES_TABLE).update({ completed_at: nowIso, updated_at: nowIso }).eq('id', batchId)
  if (error) throw error
  const { data: intakeRows, error: re } = await supabase
    .from('storage_intakes')
    .select('batch_id')
    .eq('storage_location_id', storageLocationId)
  if (re) throw re
  await syncStorageLocationFillStatusFromIntakes(storageLocationId, (intakeRows ?? []) as { batch_id: string | null }[])
}

export async function formStorageBatch(payload: {
  storageLocationId: string
  intakeIds: string[]
  cropKey: string | null
  purpose: string
  useGoal: string
  quality: Record<string, unknown>
  totalNetTons: number
}): Promise<StorageBatchRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  if (!payload.intakeIds.length) throw new Error('Выберите минимум один источник')

  const code = nextBatchCode()
  const nowIso = new Date().toISOString()

  const { data: batch, error: batchError } = await supabase
    .from(STORAGE_BATCHES_TABLE)
    .insert({
      code,
      storage_location_id: payload.storageLocationId,
      crop_key: payload.cropKey,
      purpose: payload.purpose,
      use_goal: payload.useGoal,
      quality: payload.quality,
      total_net_tons: payload.totalNetTons,
      updated_at: nowIso,
    })
    .select(STORAGE_BATCHES_SELECT)
    .single()
  if (batchError) throw batchError

  const { error: intakeError } = await supabase
    .from('storage_intakes')
    .update({ batch_id: (batch as StorageBatchRow).id, batch_code: code, updated_at: nowIso })
    .in('id', payload.intakeIds)
    .eq('storage_location_id', payload.storageLocationId)
  if (intakeError) throw intakeError

  const { data: intakeRows, error: reloadError } = await supabase
    .from('storage_intakes')
    .select('batch_id')
    .eq('storage_location_id', payload.storageLocationId)
  if (reloadError) throw reloadError
  await syncStorageLocationFillStatusFromIntakes(payload.storageLocationId, (intakeRows ?? []) as { batch_id: string | null }[])

  await recalculateStorageBatchTotals((batch as StorageBatchRow).id)

  return batch as StorageBatchRow
}
