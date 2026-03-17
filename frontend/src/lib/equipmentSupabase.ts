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

export { isSupabaseConfigured }
