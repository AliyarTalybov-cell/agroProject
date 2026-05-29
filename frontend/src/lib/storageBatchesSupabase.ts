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
  storage_locations?: { id: string; name: string; address: string } | { id: string; name: string; address: string }[] | null
}

const STORAGE_BATCHES_TABLE = 'storage_batches'
const STORAGE_BATCHES_SELECT =
  'id, code, storage_location_id, crop_key, purpose, use_goal, quality, total_net_tons, created_at, updated_at, completed_at, crops ( key, label ), storage_locations ( id, name, address )'

function coalesceCropJoin(row: StorageBatchRow): { key: string; label: string } | null {
  const x = row.crops
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

export function storageBatchCropLabel(row: StorageBatchRow): string {
  return coalesceCropJoin(row)?.label ?? '—'
}

export type StorageBatchRegistryFilters = {
  search?: string
  cropKey?: string
  status?: 'forming' | 'completed' | 'closed'
  storageLocationId?: string
  fgisStatus?: 'ready' | 'uploaded' | 'not_required'
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export type StorageBatchRegistryPage = {
  rows: StorageBatchRow[]
  total: number
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

export async function loadAllStorageBatches(): Promise<StorageBatchRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(STORAGE_BATCHES_TABLE)
    .select(STORAGE_BATCHES_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as StorageBatchRow[]).map((r) => ({
    ...r,
    completed_at: r.completed_at ?? null,
  }))
}

export async function loadStorageBatchesRegistry(filters: StorageBatchRegistryFilters = {}): Promise<StorageBatchRegistryPage> {
  if (!supabase) return { rows: [], total: 0 }
  const page = Math.max(1, Number(filters.page || 1))
  const pageSize = Math.max(1, Number(filters.pageSize || 10))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from(STORAGE_BATCHES_TABLE).select(STORAGE_BATCHES_SELECT, { count: 'exact' }).order('created_at', { ascending: false })

  const search = String(filters.search || '').trim()
  if (search) query = query.ilike('code', `%${search}%`)
  if (filters.cropKey && filters.cropKey !== 'all') query = query.eq('crop_key', filters.cropKey)
  if (filters.storageLocationId && filters.storageLocationId !== 'all') query = query.eq('storage_location_id', filters.storageLocationId)
  if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00`)
  if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59`)

  if (filters.status === 'forming') query = query.is('completed_at', null)
  if (filters.status === 'completed') query = query.not('completed_at', 'is', null).gt('total_net_tons', 0.0001)
  if (filters.status === 'closed') query = query.not('completed_at', 'is', null).lte('total_net_tons', 0.0001)

  if (filters.fgisStatus === 'ready') query = query.filter('quality->>Статус выгрузки в ФГИС', 'eq', 'Готов к выгрузке')
  if (filters.fgisStatus === 'uploaded') query = query.filter('quality->>Статус выгрузки в ФГИС', 'eq', 'Выгружено')
  if (filters.fgisStatus === 'not_required') query = query.filter('quality->>Статус выгрузки в ФГИС', 'eq', 'Не требуется')

  const { data, error, count } = await query.range(from, to)
  if (error) throw error
  return {
    rows: ((data ?? []) as StorageBatchRow[]).map((r) => ({ ...r, completed_at: r.completed_at ?? null })),
    total: Number(count || 0),
  }
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

export async function updateStorageBatchQuality(batchId: string, quality: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from(STORAGE_BATCHES_TABLE)
    .update({ quality, updated_at: nowIso })
    .eq('id', batchId)
  if (error) throw error
}
