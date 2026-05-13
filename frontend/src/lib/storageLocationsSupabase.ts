import { supabase } from '@/lib/supabase'
import { assertCanDelete } from '@/lib/deletePermissions'

export type StorageLocationRow = {
  id: string
  name: string
  address: string
  fgis_grain_code: string | null
  /** Номинальная вместимость по массе зерна, т */
  capacity_tons: number | null
  location_type_id: string
  location_status_id: string
  fill_status_id: string
  /** Справочник СХ культур (crops.key), необязательно */
  crop_key: string | null
  sort_order: number
  created_at: string
  updated_at: string
  storage_location_types?: { id: string; name: string } | { id: string; name: string }[] | null
  storage_location_statuses?:
    | { id: string; name: string; marks_inactive: boolean }
    | { id: string; name: string; marks_inactive: boolean }[]
    | null
  storage_fill_statuses?:
    | { id: string; name: string; code: string | null }
    | { id: string; name: string; code: string | null }[]
    | null
  crops?: { key: string; label: string } | { key: string; label: string }[] | null
}

const STORAGE_LOCATIONS_TABLE = 'storage_locations'
const STORAGE_LOCATIONS_SELECT =
  'id, name, address, fgis_grain_code, capacity_tons, location_type_id, location_status_id, fill_status_id, crop_key, sort_order, created_at, updated_at, storage_location_types ( id, name ), storage_location_statuses ( id, name, marks_inactive ), storage_fill_statuses ( id, name, code ), crops ( key, label )'

export async function loadStorageLocations(searchQuery = ''): Promise<StorageLocationRow[]> {
  if (!supabase) return []
  let req = supabase.from(STORAGE_LOCATIONS_TABLE).select(STORAGE_LOCATIONS_SELECT).order('created_at', { ascending: false })
  const query = searchQuery.trim()
  if (query) {
    req = req.or(`name.ilike.%${query}%,address.ilike.%${query}%,fgis_grain_code.ilike.%${query}%`)
  }
  const { data, error } = await req
  if (error) throw error
  return (data ?? []) as StorageLocationRow[]
}

export async function getStorageLocationById(id: string): Promise<StorageLocationRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from(STORAGE_LOCATIONS_TABLE)
    .select(STORAGE_LOCATIONS_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as StorageLocationRow | null) ?? null
}

function coalesceTypeJoin(row: StorageLocationRow): { id: string; name: string } | null {
  const x = row.storage_location_types
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

function coalesceStatusJoin(row: StorageLocationRow): { id: string; name: string; marks_inactive: boolean } | null {
  const x = row.storage_location_statuses
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

function coalesceFillJoin(row: StorageLocationRow): { id: string; name: string; code: string | null } | null {
  const x = row.storage_fill_statuses
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

function coalesceCropJoin(row: StorageLocationRow): { key: string; label: string } | null {
  const x = row.crops
  if (x == null) return null
  if (Array.isArray(x)) return x[0] ?? null
  return x
}

export function storageLocationTypeName(row: StorageLocationRow): string {
  return coalesceTypeJoin(row)?.name?.trim() || '—'
}

export function storageLocationMarksInactive(row: StorageLocationRow): boolean {
  return coalesceStatusJoin(row)?.marks_inactive === true
}

export function storageLocationStatusName(row: StorageLocationRow): string {
  return coalesceStatusJoin(row)?.name?.trim() || '—'
}

export function storageLocationFillStatusName(row: StorageLocationRow): string {
  return coalesceFillJoin(row)?.name?.trim() || '—'
}

export function storageLocationFillStatusCode(row: StorageLocationRow): string | null {
  const c = coalesceFillJoin(row)?.code
  if (c === 'empty' || c === 'filling' || c === 'formed') return c
  return null
}

export function storageLocationCropLabel(row: StorageLocationRow): string {
  return coalesceCropJoin(row)?.label?.trim() || '—'
}

export async function addStorageLocation(payload: {
  name: string
  location_type_id: string
  location_status_id: string
  fill_status_id: string
  address: string
  capacity_tons: number
  fgis_grain_code?: string | null
  crop_key?: string | null
}): Promise<StorageLocationRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from(STORAGE_LOCATIONS_TABLE)
    .insert({
      name: payload.name.trim(),
      location_type_id: payload.location_type_id,
      location_status_id: payload.location_status_id,
      fill_status_id: payload.fill_status_id,
      address: payload.address.trim(),
      capacity_tons: payload.capacity_tons,
      fgis_grain_code: payload.fgis_grain_code?.trim() || null,
      crop_key: payload.crop_key?.trim() || null,
      updated_at: now,
    })
    .select(STORAGE_LOCATIONS_SELECT)
    .single()
  if (error) throw error
  return data as StorageLocationRow
}

export async function updateStorageLocation(
  id: string,
  payload: Partial<{
    name: string
    location_type_id: string
    location_status_id: string
    fill_status_id: string
    address: string
    capacity_tons: number
    fgis_grain_code: string | null
    crop_key: string | null
  }>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (payload.name !== undefined) updates.name = payload.name.trim()
  if (payload.location_type_id !== undefined) updates.location_type_id = payload.location_type_id
  if (payload.location_status_id !== undefined) updates.location_status_id = payload.location_status_id
  if (payload.fill_status_id !== undefined) updates.fill_status_id = payload.fill_status_id
  if (payload.address !== undefined) updates.address = payload.address.trim()
  if (payload.capacity_tons !== undefined) updates.capacity_tons = payload.capacity_tons
  if (payload.fgis_grain_code !== undefined) updates.fgis_grain_code = payload.fgis_grain_code?.trim() || null
  if (payload.crop_key !== undefined) updates.crop_key = payload.crop_key?.trim() || null
  const { error } = await supabase.from(STORAGE_LOCATIONS_TABLE).update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteStorageLocation(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  assertCanDelete()
  const { error } = await supabase.from(STORAGE_LOCATIONS_TABLE).delete().eq('id', id)
  if (error) throw error
}

/** Код статуса заполнения по фактическим поступлениям (жёсткая логика UI/ФГИС). */
export function resolveStorageFillStatusCodeFromIntakes(intakes: ReadonlyArray<{ batch_id: string | null }>): 'empty' | 'filling' | 'formed' {
  if (!intakes.length) return 'empty'
  if (intakes.some((x) => x.batch_id == null)) return 'filling'
  return 'formed'
}

/**
 * Синхронизирует `fill_status_id` места хранения с поступлениями:
 * 0 поступлений → пусто; есть неоформленные → наполняется; все оформлены → сформировано.
 */
export async function syncStorageLocationFillStatusFromIntakes(
  locationId: string,
  intakes: ReadonlyArray<{ batch_id: string | null }>,
): Promise<void> {
  if (!supabase || !locationId) return
  const code = resolveStorageFillStatusCodeFromIntakes(intakes)
  const { data: statusRow, error: statusError } = await supabase.from('storage_fill_statuses').select('id').eq('code', code).maybeSingle()
  if (statusError) throw statusError
  if (!statusRow?.id) return
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from(STORAGE_LOCATIONS_TABLE)
    .update({ fill_status_id: statusRow.id, updated_at: nowIso })
    .eq('id', locationId)
  if (error) throw error
}
