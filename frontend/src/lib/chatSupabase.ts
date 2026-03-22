import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

/** Бейдж в сайдбаре (обновляется опросом и после действий в чате) */
export const chatTotalUnread = ref(0)

export type ChatFilterTab = 'all' | 'unread' | 'teams'

export type AvatarTone = 'blue' | 'orange' | 'purple' | 'teal' | 'rose'

const TONES: AvatarTone[] = ['blue', 'orange', 'purple', 'teal', 'rose']

export function avatarToneFromUserId(id: string): AvatarTone {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]!
}

export function initialsFromProfile(displayName: string | null | undefined, email: string): string {
  const base = (displayName && displayName.trim()) || email.split('@')[0] || '?'
  const parts = base.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0]![0] + parts[1]![0]).toUpperCase()
  if (parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase()
  return parts[0]![0]!.toUpperCase()
}

export type ChatThreadListRow = {
  thread_id: string
  kind: 'direct' | 'group'
  title: string | null
  updated_at: string
  last_message_body: string
  last_message_at: string | null
  last_sender_id: string | null
  unread_count: number
  peer_user_id: string | null
  peer_display_name: string | null
  peer_email: string | null
  peer_position: string | null
  /** Для «в сети» по last_activity_at (RPC list_my_chat_threads) */
  peer_last_activity_at?: string | null
}

export type UiChatConversation = {
  id: string
  kind: 'direct' | 'group'
  name: string
  role: string
  initials: string
  tone: AvatarTone
  lastPreview: string
  lastTime: string
  unread: number
  isTeam: boolean
  peerUserId: string | null
  /** Для лички: profiles.last_activity_at; у группы null (присутствие не по собеседнику) */
  peerLastActivityAt: string | null
  /** Для поиска: ФИО + email (личка) или название группы */
  searchHaystack: string
}

export type ChatMessageRow = {
  id: string
  thread_id: string
  sender_id: string
  body: string | null
  attachment_name: string | null
  attachment_size: number | null
  created_at: string
}

export type UiChatMessage = {
  id: string
  side: 'in' | 'out'
  senderId: string
  text?: string
  time: string
  read?: boolean
  attachment?: { name: string; size: string }
  createdAt: string
  /** В группе — аватар отправителя входящих */
  inAvatarInitials?: string
  inAvatarTone?: AvatarTone
}

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Относительное время для списка диалогов */
export function formatThreadListTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startToday.getTime() - startMsg.getTime()) / 86400000)
  if (diffDays === 0) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Вчера'
  if (diffDays < 7) {
    return d.toLocaleDateString('ru-RU', { weekday: 'short' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** Время внутри пузыря */
export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/** Порог «в сети» по last_activity_at (должен совпадать с продуктовой логикой на UI) */
export const PRESENCE_ONLINE_WITHIN_MS = 15 * 60 * 1000

/**
 * Присутствие по полю last_activity_at: не позднее 15 мин — «В сети», иначе дата и время.
 */
export function presenceFromLastActivity(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): { online: boolean; presenceLabel: string } {
  if (!iso) {
    return { online: false, presenceLabel: 'Нет данных об активности' }
  }
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) {
    return { online: false, presenceLabel: 'Нет данных об активности' }
  }
  if (nowMs - t <= PRESENCE_ONLINE_WITHIN_MS) {
    return { online: true, presenceLabel: 'В сети' }
  }
  const formatted = new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return { online: false, presenceLabel: `Был в сети ${formatted}` }
}

export function mapThreadRow(r: ChatThreadListRow): UiChatConversation {
  const isTeam = r.kind === 'group'
  const peerId = r.peer_user_id
  const email = r.peer_email ?? ''
  const name = isTeam
    ? (r.title || 'Группа')
    : (r.peer_display_name?.trim() || email.split('@')[0] || 'Сотрудник')
  const role = isTeam ? 'Групповой чат' : (r.peer_position?.trim() || 'Сотрудник')
  const initials = isTeam
    ? (r.title || 'Гр').slice(0, 2).toUpperCase()
    : initialsFromProfile(r.peer_display_name, email)
  const toneKey = isTeam ? r.thread_id : peerId || r.thread_id
  const searchHaystack = isTeam
    ? [r.title?.trim(), name.trim()].filter((s) => s && s.length > 0).join(' ')
    : [r.peer_display_name?.trim(), email.trim()].filter((s) => s && s.length > 0).join(' ')
  return {
    id: r.thread_id,
    kind: r.kind,
    name,
    role,
    initials,
    tone: avatarToneFromUserId(toneKey),
    lastPreview: r.last_message_body || (isTeam ? 'Нет сообщений' : ''),
    lastTime: formatThreadListTime(r.last_message_at),
    unread: Number(r.unread_count) || 0,
    isTeam,
    peerUserId: peerId,
    peerLastActivityAt: !isTeam ? (r.peer_last_activity_at ?? null) : null,
    searchHaystack,
  }
}

/**
 * Поиск в списке чатов: по подстроке или по всем «словам» запроса (≥2 символов) в любом порядке — удобно для ФИО.
 */
export function matchesChatListSearch(haystack: string, queryRaw: string): boolean {
  const q = queryRaw.trim()
  if (!q) return true
  let h: string
  let query: string
  try {
    h = haystack.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ')
    query = q.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()
  } catch {
    h = haystack.toLowerCase().replace(/\s+/g, ' ')
    query = q.toLowerCase().replace(/\s+/g, ' ').trim()
  }
  if (h.includes(query)) return true
  const tokens = query.split(/\s+/).filter((t) => t.length >= 2)
  if (tokens.length >= 2 && tokens.every((t) => h.includes(t))) return true
  return false
}

export async function fetchChatThreadList(): Promise<ChatThreadListRow[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  const { data, error } = await supabase.rpc('list_my_chat_threads')
  if (error) throw error
  return (data ?? []) as ChatThreadListRow[]
}

export async function refreshChatTotalUnread(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    chatTotalUnread.value = 0
    return
  }
  const { data, error } = await supabase.rpc('chat_total_unread')
  if (error) {
    console.warn('chat_total_unread', error)
    return
  }
  chatTotalUnread.value = typeof data === 'number' ? data : Number(data ?? 0)
}

export async function fetchThreadMessages(threadId: string): Promise<ChatMessageRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, thread_id, sender_id, body, attachment_name, attachment_size, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ChatMessageRow[]
}

export type SenderMeta = { initials: string; tone: AvatarTone }

export async function fetchSenderMetaMap(senderIds: string[]): Promise<Map<string, SenderMeta>> {
  const map = new Map<string, SenderMeta>()
  const uniq = [...new Set(senderIds)].filter(Boolean)
  if (!supabase || !uniq.length) return map
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, position')
    .in('id', uniq)
  if (error || !data) return map
  for (const p of data as { id: string; display_name: string | null; email: string; position: string | null }[]) {
    map.set(p.id, {
      initials: initialsFromProfile(p.display_name, p.email || ''),
      tone: avatarToneByPosition(p.position),
    })
  }
  return map
}

function avatarToneByPosition(position: string | null | undefined): AvatarTone {
  const key = String(position || '—')
    .trim()
    .toLowerCase()
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]!
}

export function mapMessagesForUi(
  rows: ChatMessageRow[],
  myUserId: string,
  peerLastReadAt: string | null,
  options?: { isGroup: boolean; senderMeta: Map<string, SenderMeta> },
): UiChatMessage[] {
  return rows.map((m) => {
    const out = m.sender_id === myUserId
    const att =
      m.attachment_name
        ? { name: m.attachment_name, size: formatBytes(m.attachment_size) }
        : undefined
    let read: boolean | undefined
    if (out && peerLastReadAt) {
      read = new Date(peerLastReadAt) >= new Date(m.created_at)
    }
    const meta = !out && options?.isGroup ? options.senderMeta.get(m.sender_id) : undefined
    return {
      id: m.id,
      side: out ? 'out' : 'in',
      senderId: m.sender_id,
      text: m.body?.trim() ? m.body : undefined,
      time: formatMessageTime(m.created_at),
      read,
      attachment: att,
      createdAt: m.created_at,
      inAvatarInitials: meta?.initials,
      inAvatarTone: meta?.tone,
    }
  })
}

export async function markThreadAsRead(threadId: string): Promise<void> {
  if (!supabase) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Предпочитаем RPC (SECURITY DEFINER): стабильнее при RLS, чем прямой UPDATE из клиента.
  const { error: rpcErr } = await supabase.rpc('mark_chat_thread_read', { p_thread: threadId })
  if (rpcErr) {
    const msg = String((rpcErr as { message?: string }).message || '')
    const code = String((rpcErr as { code?: string }).code || '')
    const ml = msg.toLowerCase()
    const missingFn =
      code === '42883' ||
      code === 'PGRST202' ||
      ml.includes('could not find') ||
      ml.includes('does not exist') ||
      ml.includes('не найден') ||
      (ml.includes('function') && ml.includes('mark_chat_thread_read'))
    if (!missingFn) throw rpcErr

    const { error: updErr } = await supabase
      .from('chat_thread_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
    if (updErr) throw updErr
  }

  await refreshChatTotalUnread()
}

export async function sendChatMessage(threadId: string, body: string): Promise<void> {
  if (!supabase) throw new Error('Нет подключения')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Требуется вход')
  const trimmed = body.trim()
  if (!trimmed) return
  const { error } = await supabase.from('chat_messages').insert({
    thread_id: threadId,
    sender_id: user.id,
    body: trimmed,
  })
  if (error) throw error
}

export async function getOrCreateDmThread(otherUserId: string): Promise<string> {
  if (!supabase) throw new Error('Нет подключения')
  const { data, error } = await supabase.rpc('get_or_create_dm_thread', { p_other_user: otherUserId })
  if (error) throw error
  if (!data) throw new Error('Не удалось открыть диалог')
  return String(data)
}

export async function createGroupThread(title: string, memberIds: string[]): Promise<string> {
  if (!supabase) throw new Error('Нет подключения')
  const { data, error } = await supabase.rpc('create_group_thread', {
    p_title: title,
    p_member_ids: memberIds,
  })
  if (error) throw error
  if (!data) throw new Error('Не удалось создать группу')
  return String(data)
}

/** last_read_at собеседника (для галочек «прочитано» в direct) */
export async function fetchPeerLastRead(threadId: string, peerUserId: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('chat_thread_members')
    .select('last_read_at')
    .eq('thread_id', threadId)
    .eq('user_id', peerUserId)
    .maybeSingle()
  if (error || !data) return null
  return data.last_read_at as string | null
}

export type GroupMemberDisplay = {
  userId: string
  displayName: string
  roleLabel: string
  initials: string
  tone: AvatarTone
  /** profiles.last_activity_at — текст «В сети» считается на клиенте по таймеру */
  lastActivityAt: string | null
  isSelf: boolean
}

/**
 * Участники группового чата + присутствие по profiles.last_activity_at.
 */
export async function fetchGroupThreadMembersDisplay(
  threadId: string,
  currentUserId?: string | null,
): Promise<GroupMemberDisplay[]> {
  if (!supabase) return []
  const { data: rows, error } = await supabase.from('chat_thread_members').select('user_id').eq('thread_id', threadId)
  if (error || !rows?.length) return []
  const ids = rows.map((r) => r.user_id as string)
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, display_name, email, position, role, last_activity_at')
    .in('id', ids)
  if (pErr) throw pErr
  type P = {
    id: string
    display_name: string | null
    email: string
    position: string | null
    role: string | null
    last_activity_at: string | null
  }
  const profMap = new Map((profs as P[] | null)?.map((p) => [p.id, p]) ?? [])
  const me = currentUserId ?? ''
  const result: GroupMemberDisplay[] = ids.map((id) => {
    const p = profMap.get(id)
    const email = p?.email ?? ''
    const name = p?.display_name?.trim() || email.split('@')[0] || 'Участник'
    let roleLabel = p?.position?.trim()
    if (!roleLabel) {
      roleLabel = p?.role === 'manager' ? 'Руководитель' : p?.role === 'worker' ? 'Сотрудник' : 'Участник'
    }
    return {
      userId: id,
      displayName: name,
      roleLabel,
      initials: initialsFromProfile(p?.display_name, email),
      tone: avatarToneFromUserId(id),
      lastActivityAt: p?.last_activity_at ?? null,
      isSelf: Boolean(me && id === me),
    }
  })
  result.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
    return a.displayName.localeCompare(b.displayName, 'ru')
  })
  return result
}

export function subscribeToThreadMessages(
  threadId: string,
  onInsert: () => void,
): { unsubscribe: () => void } {
  if (!supabase) return { unsubscribe: () => {} }
  const client = supabase
  const channel = client
    .channel(`chat-messages:${threadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
      () => onInsert(),
    )
    .subscribe()
  return {
    unsubscribe: () => {
      void client.removeChannel(channel)
    },
  }
}
