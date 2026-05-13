/**
 * Метрики карточки «Склады» по месту хранения.
 * Сейчас — заглушка: таблицы поступлений / партий ещё нет.
 * Позже: подставить данные из Supabase и маппить fillState по правилам бизнеса.
 */
export type BatchFillState = 'empty' | 'filling' | 'formed'

export type WarehouseCardMetrics = {
  fillState: BatchFillState
  occupancyPercent: number
  totalMassTons: number
  cropLabel: string | null
  lastOperationAt: string | null
}

/** Код из справочника `storage_fill_statuses`; неизвестные и пользовательские без кода — как «пусто» для цвета/фильтра по системным кодам. */
export function fillBatchStateFromCode(code: string | null | undefined): BatchFillState {
  if (code === 'filling' || code === 'formed') return code
  return 'empty'
}

export function placeholderWarehouseMetrics(): WarehouseCardMetrics {
  return {
    fillState: 'empty',
    occupancyPercent: 0,
    totalMassTons: 0,
    cropLabel: null,
    lastOperationAt: null,
  }
}
