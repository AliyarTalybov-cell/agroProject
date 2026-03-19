import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export type EquipmentCondition = 'operational' | 'repair' | 'decommissioned'

export type EquipmentRow = {
  id: string
  brand: string
  license_plate: string
  model: string | null
  equipment_type: string | null
  year: number | null
  purpose_crop: string | null
  condition: EquipmentCondition
  responsible_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const EQUIPMENT_TABLE = 'equipment'
const EQUIPMENT_PHOTOS_TABLE = 'equipment_photos'
const EQUIPMENT_PHOTOS_BUCKET = 'equipment-photos'

export type EquipmentPhotoRow = {
  id: string
  equipment_id: string
  file_url: string
  file_path?: string | null
  title: string | null
  description: string | null
  created_at: string
}

export async function getEquipmentById(id: string): Promise<EquipmentRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from(EQUIPMENT_TABLE)
    .select('id, brand, license_plate, model, equipment_type, year, purpose_crop, condition, responsible_id, notes, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as EquipmentRow | null
}

export async function loadEquipment(): Promise<EquipmentRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(EQUIPMENT_TABLE)
    .select('id, brand, license_plate, model, equipment_type, year, purpose_crop, condition, responsible_id, notes, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EquipmentRow[]
}

export async function insertEquipment(payload: {
  brand: string
  license_plate: string
  model?: string | null
  equipment_type?: string | null
  year?: number | null
  purpose_crop?: string | null
  condition?: EquipmentCondition
  responsible_id?: string | null
  notes?: string | null
}): Promise<EquipmentRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from(EQUIPMENT_TABLE)
    .insert({
      brand: payload.brand.trim(),
      license_plate: payload.license_plate.trim(),
      model: payload.model?.trim() || null,
      equipment_type: payload.equipment_type || null,
      year: payload.year ?? null,
      purpose_crop: payload.purpose_crop?.trim() || null,
      condition: payload.condition ?? 'operational',
      responsible_id: payload.responsible_id ?? null,
      notes: payload.notes?.trim() || null,
      updated_at: now,
    })
    .select()
    .single()
  if (error) throw error
  return data as EquipmentRow
}

export async function updateEquipment(
  id: string,
  updates: Partial<{
    brand: string
    license_plate: string
    model: string | null
    equipment_type: string | null
    year: number | null
    purpose_crop: string | null
    condition: EquipmentCondition
    responsible_id: string | null
    notes: string | null
  }>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { error } = await supabase
    .from(EQUIPMENT_TABLE)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteEquipment(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')
  const { error } = await supabase.from(EQUIPMENT_TABLE).delete().eq('id', id)
  if (error) throw error
}

export async function loadEquipmentPhotos(equipmentId: string): Promise<EquipmentPhotoRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(EQUIPMENT_PHOTOS_TABLE)
    .select('id, equipment_id, file_url, file_path, title, description, created_at')
    .eq('equipment_id', equipmentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EquipmentPhotoRow[]
}

export async function addEquipmentPhoto(
  equipmentId: string,
  file: File,
  title?: string,
  description?: string,
): Promise<EquipmentPhotoRow> {
  if (!supabase) throw new Error('Supabase не настроен')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const safeBase = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const path = `${equipmentId}/${Date.now()}-${safeBase}.${ext}`

  const { data: uploadData, error: uploadError } = await supabase.storage.from(EQUIPMENT_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  })
  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage.from(EQUIPMENT_PHOTOS_BUCKET).getPublicUrl(uploadData.path)

  const { data: row, error: rowError } = await supabase
    .from(EQUIPMENT_PHOTOS_TABLE)
    .insert({
      equipment_id: equipmentId,
      file_url: urlData.publicUrl,
      file_path: uploadData.path,
      title: title?.trim() || null,
      description: description?.trim() || null,
    })
    .select()
    .single()
  if (rowError) throw rowError
  return row as EquipmentPhotoRow
}

export async function deleteEquipmentPhoto(photoId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase не настроен')

  // Сначала пробуем получить file_path (если колонки нет — просто удалим запись)
  let filePath: string | null = null
  try {
    const { data: row, error: fetchError } = await supabase
      .from(EQUIPMENT_PHOTOS_TABLE)
      .select('id, file_path')
      .eq('id', photoId)
      .maybeSingle()
    if (fetchError) throw fetchError
    filePath = (row as { file_path?: string | null } | null)?.file_path ?? null
  } catch {
    filePath = null
  }

  const { error: delError } = await supabase.from(EQUIPMENT_PHOTOS_TABLE).delete().eq('id', photoId)
  if (delError) throw delError

  if (filePath) {
    await supabase.storage.from(EQUIPMENT_PHOTOS_BUCKET).remove([filePath])
  }
}

export { isSupabaseConfigured }
