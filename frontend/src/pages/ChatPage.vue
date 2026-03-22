<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuth } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import { loadEmployees, searchEmployees, type EmployeeRow } from '@/lib/employeesSupabase'
import {
  type AvatarTone,
  type ChatFilterTab,
  type UiChatConversation,
  type UiChatMessage,
  createGroupThread,
  fetchChatThreadList,
  fetchPeerLastRead,
  fetchSenderMetaMap,
  fetchThreadMessages,
  getOrCreateDmThread,
  mapMessagesForUi,
  mapThreadRow,
  matchesChatListSearch,
  markThreadAsRead,
  refreshChatTotalUnread,
  sendChatMessage,
  subscribeToThreadMessages,
  fetchGroupThreadMembersDisplay,
  presenceFromLastActivity,
  type GroupMemberDisplay,
} from '@/lib/chatSupabase'

const auth = useAuth()
const isManager = computed(() => auth.userRole.value === 'manager')
const myId = computed(() => auth.user.value?.id ?? '')

const userInitials = computed(() => {
  const email = auth.user.value?.email ?? ''
  const part = email.split('@')[0]
  if (part.length >= 2) return part.slice(0, 2).toUpperCase()
  return part.slice(0, 1).toUpperCase() || 'ВЫ'
})

const configured = computed(() => isSupabaseConfigured())
/** Первичная загрузка списка диалогов (не «Загрузка чата») */
const listLoading = ref(false)
/** Загрузка открытого диалога: сообщения, отметка прочитанного */
const chatLoading = ref(false)
const refreshBusy = ref(false)
const error = ref<string | null>(null)
const conversations = ref<UiChatConversation[]>([])
const activeId = ref<string | null>(null)
const filterTab = ref<ChatFilterTab>('all')
const searchLocal = ref('')
const messages = ref<UiChatMessage[]>([])
const draft = ref('')

const groupMembers = ref<GroupMemberDisplay[]>([])
const groupMembersLoading = ref(false)
/** Состав группы: показать / скрыть (клик по логотипу или числу участников) */
const groupRosterExpanded = ref(false)

function toggleGroupRoster() {
  groupRosterExpanded.value = !groupRosterExpanded.value
}

const dmModalOpen = ref(false)
const dmSearch = ref('')
const dmResults = ref<EmployeeRow[]>([])
const dmLoading = ref(false)

const groupModalOpen = ref(false)
const groupTitle = ref('')
const groupEmployees = ref<EmployeeRow[]>([])
const groupSelected = ref<Set<string>>(new Set())
const groupBusy = ref(false)

let dmSearchTimer: ReturnType<typeof setTimeout> | null = null
let rtStop: (() => void) | null = null
let presenceTicker: ReturnType<typeof setInterval> | null = null
/** Инкремент раз в минуту — пересчёт «в сети» по last_activity без новых запросов */
const presenceClock = ref(0)

const active = computed(() => conversations.value.find((c) => c.id === activeId.value) ?? null)

const filteredList = computed(() => {
  const q = searchLocal.value.trim()
  return conversations.value.filter((c) => {
    if (filterTab.value === 'unread' && c.unread <= 0) return false
    if (filterTab.value === 'teams' && !c.isTeam) return false
    return matchesChatListSearch(c.searchHaystack, q)
  })
})

function setTab(tab: ChatFilterTab) {
  filterTab.value = tab
}

function toneClass(tone: AvatarTone) {
  return `chat-page__av chat-page__av--${tone}`
}

function renderMessageBlocks(msgs: UiChatMessage[]) {
  const blocks: { msg: UiChatMessage; showAvatar: boolean }[] = []
  let lastKey: string | null = null
  for (const msg of msgs) {
    const key = msg.side === 'out' ? 'out' : `in:${msg.senderId}`
    const showAvatar = key !== lastKey
    lastKey = key
    blocks.push({ msg, showAvatar })
  }
  return blocks
}

const messageBlocks = computed(() => renderMessageBlocks(messages.value))

const onlineInGroupCount = computed(() => {
  void presenceClock.value
  return groupMembers.value.filter((m) => presenceFromLastActivity(m.lastActivityAt).online).length
})

function livePresence(iso: string | null) {
  void presenceClock.value
  return presenceFromLastActivity(iso)
}

function convListPresence(c: UiChatConversation) {
  if (c.kind !== 'direct') return { online: false, presenceLabel: '' }
  return livePresence(c.peerLastActivityAt)
}

function groupMemberPresence(m: GroupMemberDisplay) {
  return livePresence(m.lastActivityAt)
}

const activeDirectPresence = computed(() => {
  void presenceClock.value
  const a = active.value
  if (!a || a.kind !== 'direct') return null
  return presenceFromLastActivity(a.peerLastActivityAt)
})

function participantsLabel(n: number): string {
  const h = n % 100
  const m = n % 10
  if (h >= 11 && h <= 14) return `${n} участников`
  if (m === 1) return `${n} участник`
  if (m >= 2 && m <= 4) return `${n} участника`
  return `${n} участников`
}

async function loadGroupMembers() {
  const tid = activeId.value
  const conv = conversations.value.find((c) => c.id === tid)
  if (!tid || conv?.kind !== 'group') {
    groupMembers.value = []
    groupMembersLoading.value = false
    return
  }
  groupMembersLoading.value = true
  try {
    groupMembers.value = await fetchGroupThreadMembersDisplay(tid, myId.value || null)
  } catch {
    groupMembers.value = []
  } finally {
    groupMembersLoading.value = false
  }
}

const composerPlaceholder = computed(() => {
  if (!active.value) return 'Выберите диалог…'
  const first = active.value.name.split(' ')[0] || active.value.name
  return `Напишите сообщение ${first}…`
})

async function refreshThreads() {
  if (!configured.value) return
  const rows = await fetchChatThreadList()
  conversations.value = rows.map(mapThreadRow)
}

async function reloadMessages() {
  const uid = myId.value
  const tid = activeId.value
  if (!tid || !uid) {
    messages.value = []
    return
  }
  const rows = await fetchThreadMessages(tid)
  const conv = conversations.value.find((c) => c.id === tid)
  let peerRead: string | null = null
  if (conv?.kind === 'direct' && conv.peerUserId) {
    peerRead = await fetchPeerLastRead(tid, conv.peerUserId)
  }
  const incomingSenders = [...new Set(rows.filter((r) => r.sender_id !== uid).map((r) => r.sender_id))]
  const meta =
    conv?.kind === 'group' ? await fetchSenderMetaMap(incomingSenders) : new Map()
  messages.value = mapMessagesForUi(rows, uid, peerRead, conv?.kind === 'group' ? { isGroup: true, senderMeta: meta } : undefined)
}

function stopRealtime() {
  rtStop?.()
  rtStop = null
}

function startRealtime() {
  stopRealtime()
  const tid = activeId.value
  if (!tid) return
  const { unsubscribe } = subscribeToThreadMessages(tid, () => {
    void reloadMessages()
    void refreshThreads()
    void refreshChatTotalUnread()
  })
  rtStop = unsubscribe
}

async function onPick(c: UiChatConversation) {
  if (!configured.value) return
  error.value = null
  if (c.kind !== 'group') {
    groupMembers.value = []
    groupMembersLoading.value = false
    groupRosterExpanded.value = false
  } else {
    groupRosterExpanded.value = false
  }
  activeId.value = c.id
  chatLoading.value = true
  try {
    await markThreadAsRead(c.id)
    await refreshChatTotalUnread()
    await refreshThreads()
    await Promise.all([reloadMessages(), c.kind === 'group' ? loadGroupMembers() : Promise.resolve()])
    startRealtime()
  } catch (e) {
    error.value = formatSupabaseError(e) || 'Не удалось открыть диалог'
  } finally {
    chatLoading.value = false
  }
}

/** Обновить список диалогов и (если открыт) сообщения текущего чата */
async function refreshChat() {
  if (!configured.value || refreshBusy.value) return
  error.value = null
  refreshBusy.value = true
  const hadThread = Boolean(activeId.value)
  if (hadThread) chatLoading.value = true
  try {
    await refreshThreads()
    await refreshChatTotalUnread()
    if (activeId.value) {
      await reloadMessages()
      const conv = conversations.value.find((x) => x.id === activeId.value)
      if (conv?.kind === 'group') await loadGroupMembers()
    }
  } catch (e) {
    error.value = formatSupabaseError(e) || 'Не удалось обновить'
  } finally {
    refreshBusy.value = false
    if (hadThread) chatLoading.value = false
  }
}

async function onSend() {
  if (!activeId.value || !draft.value.trim()) return
  error.value = null
  try {
    await sendChatMessage(activeId.value, draft.value)
    draft.value = ''
    await reloadMessages()
    await refreshThreads()
    await refreshChatTotalUnread()
  } catch (e) {
    error.value = formatSupabaseError(e) || 'Не удалось отправить'
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void onSend()
  }
}

function todayLabel(): string {
  const d = new Date()
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ]
  return `Сегодня, ${d.getDate()} ${months[d.getMonth()]}`
}

function incomingAvatar(block: { msg: UiChatMessage }) {
  const tone = block.msg.inAvatarTone ?? active.value?.tone ?? 'blue'
  const initials = block.msg.inAvatarInitials ?? active.value?.initials ?? '?'
  return { tone, initials }
}

watch(dmSearch, (q) => {
  if (dmSearchTimer) clearTimeout(dmSearchTimer)
  dmSearchTimer = setTimeout(async () => {
    if (!configured.value) return
    dmLoading.value = true
    try {
      const list = q.trim() ? await searchEmployees(q.trim(), 40, null) : await loadEmployees(40, null)
      const me = myId.value
      dmResults.value = me ? list.filter((e) => e.id !== me) : list
    } catch {
      dmResults.value = []
    } finally {
      dmLoading.value = false
    }
  }, 320)
})

async function openDmModal() {
  dmModalOpen.value = true
  dmSearch.value = ''
  if (!configured.value) return
  dmLoading.value = true
  try {
    const list = await loadEmployees(50, null)
    const me = myId.value
    dmResults.value = me ? list.filter((e) => e.id !== me) : list
  } finally {
    dmLoading.value = false
  }
}

async function pickDmPeer(row: EmployeeRow) {
  error.value = null
  try {
    const tid = await getOrCreateDmThread(row.id)
    dmModalOpen.value = false
    await refreshThreads()
    await refreshChatTotalUnread()
    const conv = conversations.value.find((c) => c.id === tid)
    if (conv) await onPick(conv)
  } catch (e) {
    error.value = formatSupabaseError(e) || 'Не удалось создать диалог'
  }
}

async function openGroupModal() {
  groupModalOpen.value = true
  groupTitle.value = ''
  groupSelected.value = new Set()
  if (!configured.value) return
  try {
    const list = await loadEmployees(80, null)
    const me = myId.value
    groupEmployees.value = me ? list.filter((e) => e.id !== me) : list
  } catch {
    groupEmployees.value = []
  }
}

function toggleGroupMember(id: string) {
  const next = new Set(groupSelected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  groupSelected.value = next
}

async function submitGroup() {
  if (!groupTitle.value.trim() || groupSelected.value.size === 0) {
    error.value = 'Укажите название и выберите хотя бы одного участника'
    return
  }
  groupBusy.value = true
  error.value = null
  try {
    const tid = await createGroupThread(groupTitle.value.trim(), [...groupSelected.value])
    groupModalOpen.value = false
    await refreshThreads()
    await refreshChatTotalUnread()
    const conv = conversations.value.find((c) => c.id === tid)
    if (conv) await onPick(conv)
  } catch (e) {
    error.value = formatSupabaseError(e) || 'Не удалось создать команду'
  } finally {
    groupBusy.value = false
  }
}

onMounted(async () => {
  presenceTicker = setInterval(() => {
    presenceClock.value++
  }, 60_000)
  if (!configured.value) return
  listLoading.value = true
  error.value = null
  try {
    await refreshThreads()
    await refreshChatTotalUnread()
  } catch (e) {
    error.value = formatSupabaseError(e) || 'Не удалось загрузить чаты'
  } finally {
    listLoading.value = false
  }
})

onUnmounted(() => {
  stopRealtime()
  if (dmSearchTimer) clearTimeout(dmSearchTimer)
  if (presenceTicker) {
    clearInterval(presenceTicker)
    presenceTicker = null
  }
})
</script>

<template>
  <div class="chat-page">
    <p v-if="!configured" class="chat-page__warn">
      Подключите Supabase (переменные окружения), чтобы чат работал с базой данных.
    </p>
    <p v-else-if="error" class="chat-page__err">{{ error }}</p>

    <!-- Левая колонка: список (структура как design/chat.html) -->
    <section class="chat-page__list" aria-label="Диалоги">
      <div class="chat-page__list-head">
        <div v-if="configured" class="chat-page__toolbar">
          <button type="button" class="chat-page__toolbar-btn" @click="openDmModal">Написать</button>
          <button
            type="button"
            class="chat-page__toolbar-btn chat-page__toolbar-btn--refresh chat-page__toolbar-btn--icon"
            :disabled="refreshBusy || listLoading"
            title="Обновить список диалогов и сообщения"
            aria-label="Обновить чат"
            @click="refreshChat"
          >
            <svg
              class="chat-page__toolbar-refresh-svg"
              :class="{ 'chat-page__toolbar-refresh-svg--spin': refreshBusy }"
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
          <button v-if="isManager" type="button" class="chat-page__toolbar-btn chat-page__toolbar-btn--primary" @click="openGroupModal">
            Новая команда
          </button>
        </div>
        <div class="chat-page__search-wrap">
          <span class="chat-page__search-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            v-model="searchLocal"
            type="search"
            class="chat-page__search"
            placeholder="ФИО или название группы…"
            autocomplete="off"
            aria-label="Поиск по ФИО сотрудника или названию группы"
          />
        </div>
        <div class="chat-page__tabs" role="tablist" aria-label="Фильтр диалогов">
          <button
            type="button"
            role="tab"
            :aria-selected="filterTab === 'all'"
            class="chat-page__tab"
            :class="{ 'chat-page__tab--active': filterTab === 'all' }"
            @click="setTab('all')"
          >
            Все
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="filterTab === 'unread'"
            class="chat-page__tab"
            :class="{ 'chat-page__tab--active': filterTab === 'unread' }"
            @click="setTab('unread')"
          >
            Непрочитанные
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="filterTab === 'teams'"
            class="chat-page__tab"
            :class="{ 'chat-page__tab--active': filterTab === 'teams' }"
            @click="setTab('teams')"
          >
            Команды
          </button>
        </div>
      </div>

      <div class="chat-page__list-scroll">
        <div v-if="listLoading" class="chat-page__list-loader" role="status" aria-live="polite">
          <span class="chat-page__spinner chat-page__spinner--sm" aria-hidden="true" />
          <span class="chat-page__list-loader-text">Загрузка списка…</span>
        </div>
        <template v-else>
        <button
          v-for="c in filteredList"
          :key="c.id"
          type="button"
          class="chat-page__row"
          :class="{ 'chat-page__row--active': c.id === activeId }"
          @click="onPick(c)"
        >
          <div class="chat-page__row-av-wrap">
            <div :class="toneClass(c.tone)">{{ c.initials }}</div>
            <span
              class="chat-page__online"
              :class="convListPresence(c).online ? 'chat-page__online--on' : 'chat-page__online--off'"
              aria-hidden="true"
            />
          </div>
          <div class="chat-page__row-main">
            <div class="chat-page__row-top">
              <h3 class="chat-page__row-name">{{ c.name }}</h3>
              <span class="chat-page__row-time" :class="{ 'chat-page__row-time--accent': c.unread > 0 }">
                {{ c.lastTime }}
              </span>
            </div>
            <div class="chat-page__row-role">{{ c.role }}</div>
            <p class="chat-page__row-preview">
              {{ c.lastPreview }}
            </p>
          </div>
          <div v-if="c.unread > 0" class="chat-page__unread-badge" :aria-label="`Непрочитано: ${c.unread}`">
            {{ c.unread > 9 ? '9+' : c.unread }}
          </div>
        </button>
        <p v-if="!filteredList.length" class="chat-page__empty">Нет диалогов по выбранному фильтру.</p>
        </template>
      </div>
    </section>

    <!-- Правая колонка: активный чат -->
    <section class="chat-page__thread" aria-label="Переписка">
      <div v-if="!configured" class="chat-page__thread-empty">
        <p>Сообщения загружаются из Supabase после настройки проекта.</p>
      </div>
      <div v-else-if="!active" class="chat-page__thread-empty">
        <p>Выберите диалог слева или нажмите «Написать».</p>
      </div>
      <template v-else>
        <header class="chat-page__thread-head">
          <div class="chat-page__thread-user">
            <button
              v-if="active.kind === 'group'"
              type="button"
              class="chat-page__group-logo-btn chat-page__row-av-wrap"
              :aria-expanded="groupRosterExpanded"
              aria-controls="chat-group-roster"
              :aria-label="groupRosterExpanded ? 'Скрыть состав группы' : 'Показать состав группы'"
              :title="groupRosterExpanded ? 'Скрыть состав' : 'Показать состав'"
              @click="toggleGroupRoster"
            >
              <div :class="toneClass(active.tone)">{{ active.initials }}</div>
            </button>
            <div v-else class="chat-page__row-av-wrap">
              <div :class="toneClass(active.tone)">{{ active.initials }}</div>
              <span
                class="chat-page__online"
                :class="activeDirectPresence?.online ? 'chat-page__online--on' : 'chat-page__online--off'"
                aria-hidden="true"
              />
            </div>
            <div>
              <h2 class="chat-page__thread-title">{{ active.name }}</h2>
              <p v-if="active.kind === 'group'" class="chat-page__thread-meta">
                <button
                  type="button"
                  class="chat-page__group-participants-btn"
                  :aria-expanded="groupRosterExpanded"
                  aria-controls="chat-group-roster"
                  :aria-label="`${groupRosterExpanded ? 'Скрыть' : 'Показать'} состав (${participantsLabel(groupMembers.length)})`"
                  :title="groupRosterExpanded ? 'Скрыть состав' : 'Показать состав'"
                  @click="toggleGroupRoster"
                >
                  {{ participantsLabel(groupMembers.length) }}
                </button>
                <span class="chat-page__dot" aria-hidden="true" />
                <span :class="onlineInGroupCount > 0 ? 'chat-page__status-on' : 'chat-page__status-off'">
                  В сети: {{ onlineInGroupCount }}
                </span>
              </p>
              <p v-else class="chat-page__thread-meta">
                {{ active.role }}
                <span class="chat-page__dot" aria-hidden="true" />
                <span
                  v-if="activeDirectPresence"
                  :class="activeDirectPresence.online ? 'chat-page__status-on' : 'chat-page__status-off'"
                >
                  {{ activeDirectPresence.presenceLabel }}
                </span>
              </p>
            </div>
          </div>
          <div class="chat-page__thread-actions">
            <button
              type="button"
              class="chat-page__icon-btn"
              title="Обновить переписку"
              aria-label="Обновить переписку"
              :disabled="refreshBusy"
              @click="refreshChat"
            >
              <svg
                class="chat-page__thread-refresh-ico"
                :class="{ 'chat-page__thread-refresh-ico--spin': refreshBusy }"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
            <button type="button" class="chat-page__icon-btn" title="Поиск по чату" aria-label="Поиск по чату">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <button type="button" class="chat-page__icon-btn" title="Информация" aria-label="Информация о диалоге">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
          </div>
        </header>

        <div class="chat-page__thread-main">
          <div v-if="chatLoading" class="chat-page__chat-loading" role="status" aria-live="polite">
            <span class="chat-page__spinner chat-page__spinner--lg" aria-hidden="true" />
            <p class="chat-page__chat-loading-title">Загрузка чата</p>
          </div>

          <template v-else>
            <div class="chat-page__thread-loaded">
            <div
              v-if="active.kind === 'group'"
              id="chat-group-roster"
              v-show="groupRosterExpanded"
              class="chat-page__group-roster"
              aria-label="Состав группы"
            >
              <div class="chat-page__group-roster-head">
                <h3 class="chat-page__group-roster-title">Состав</h3>
                <span v-if="!groupMembersLoading" class="chat-page__group-roster-sub">
                  {{ onlineInGroupCount }} из {{ groupMembers.length }} в сети
                </span>
              </div>
              <div v-if="groupMembersLoading" class="chat-page__group-roster-loading" role="status">
                <span class="chat-page__spinner chat-page__spinner--sm" aria-hidden="true" />
                <span>Загрузка состава…</span>
              </div>
              <ul v-else class="chat-page__group-roster-list">
                <li v-for="m in groupMembers" :key="m.userId" class="chat-page__group-roster-item">
                  <div class="chat-page__row-av-wrap">
                    <div :class="toneClass(m.tone)">{{ m.initials }}</div>
                    <span
                      class="chat-page__online"
                      :class="groupMemberPresence(m).online ? 'chat-page__online--on' : 'chat-page__online--off'"
                      :title="groupMemberPresence(m).presenceLabel"
                      :aria-label="`${m.displayName}, ${groupMemberPresence(m).presenceLabel}`"
                    />
                  </div>
                  <div class="chat-page__group-roster-text">
                    <span class="chat-page__group-roster-name">
                      {{ m.displayName }}
                      <span v-if="m.isSelf" class="chat-page__group-roster-you">(вы)</span>
                    </span>
                    <span class="chat-page__group-roster-role">{{ m.roleLabel }}</span>
                    <span
                      class="chat-page__group-roster-status"
                      :class="groupMemberPresence(m).online ? 'chat-page__group-roster-status--on' : 'chat-page__group-roster-status--off'"
                    >
                      {{ groupMemberPresence(m).presenceLabel }}
                    </span>
                  </div>
                </li>
              </ul>
            </div>

            <div class="chat-page__messages">
              <div class="chat-page__date-pill-wrap">
                <span class="chat-page__date-pill">{{ todayLabel() }}</span>
              </div>

              <div v-if="!messageBlocks.length" class="chat-page__no-messages">Сообщений пока нет — напишите первым.</div>

              <div v-for="block in messageBlocks" :key="block.msg.id" class="chat-page__msg-row" :class="{ 'chat-page__msg-row--out': block.msg.side === 'out' }">
                <template v-if="block.msg.side === 'in'">
                  <div
                    v-if="block.showAvatar"
                    :class="[toneClass(incomingAvatar(block).tone), 'chat-page__msg-av']"
                  >
                    {{ incomingAvatar(block).initials }}
                  </div>
                  <div v-else class="chat-page__msg-av-spacer" />
                </template>

                <div class="chat-page__msg-col" :class="{ 'chat-page__msg-col--out': block.msg.side === 'out' }">
              <div v-if="block.msg.text" class="chat-page__bubble" :class="block.msg.side === 'out' ? 'chat-page__bubble--out' : 'chat-page__bubble--in'">
                <p>{{ block.msg.text }}</p>
              </div>
              <div
                v-if="block.msg.attachment"
                class="chat-page__attach"
                :class="block.msg.side === 'out' ? 'chat-page__attach--out' : ''"
              >
                <div class="chat-page__attach-icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
                  </svg>
                </div>
                <div class="chat-page__attach-meta">
                  <p class="chat-page__attach-name">{{ block.msg.attachment.name }}</p>
                  <p class="chat-page__attach-size">{{ block.msg.attachment.size }}</p>
                </div>
              </div>
                <div class="chat-page__msg-foot" :class="{ 'chat-page__msg-foot--out': block.msg.side === 'out' }">
                  <span>{{ block.msg.time }}</span>
                  <svg
                    v-if="block.msg.side === 'out' && block.msg.read"
                    class="chat-page__read-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-label="Прочитано"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                </div>

                <template v-if="block.msg.side === 'out'">
                  <div v-if="block.showAvatar" class="chat-page__msg-av chat-page__msg-av--me">
                    {{ userInitials }}
                  </div>
                  <div v-else class="chat-page__msg-av-spacer" />
                </template>
              </div>
            </div>

            <footer class="chat-page__composer-wrap">
              <div class="chat-page__composer">
            <button type="button" class="chat-page__composer-icon" title="Прикрепить файл" aria-label="Прикрепить файл" :disabled="chatLoading">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15.172 7 8.586 13.586a2 2 0 1 0 2.828 2.828l6.414-6.586a4 4 0 1 0-5.656-5.656l-6.415 6.585a6 6 0 1 0 8.486 8.486L20.5 13" />
              </svg>
            </button>
            <textarea
              v-model="draft"
              class="chat-page__textarea"
              rows="1"
              :placeholder="composerPlaceholder"
              :disabled="chatLoading"
              @keydown="onKeydown"
            />
            <div class="chat-page__composer-right">
              <button type="button" class="chat-page__composer-icon" title="Эмодзи" aria-label="Эмодзи" :disabled="chatLoading">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                </svg>
              </button>
              <button type="button" class="chat-page__send" aria-label="Отправить" :disabled="chatLoading" @click="onSend">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
              </div>
              <p class="chat-page__hint">Нажмите Enter для отправки, Shift+Enter для переноса</p>
            </footer>
            </div>
          </template>
        </div>
      </template>
    </section>

    <!-- Модалка: личный диалог -->
    <div v-if="dmModalOpen" class="chat-page__modal-backdrop" role="dialog" aria-modal="true" aria-label="Новое сообщение" @click.self="dmModalOpen = false">
      <div class="chat-page__modal" @click.stop>
        <div class="chat-page__modal-head">
          <h2 class="chat-page__modal-title">Кому написать</h2>
          <button type="button" class="chat-page__modal-close" aria-label="Закрыть" @click="dmModalOpen = false">×</button>
        </div>
        <input v-model="dmSearch" type="search" class="chat-page__modal-search" placeholder="Поиск по сотрудникам…" autocomplete="off" />
        <div class="chat-page__modal-list">
          <p v-if="dmLoading" class="chat-page__empty">Поиск…</p>
          <button
            v-for="row in dmResults"
            :key="row.id"
            type="button"
            class="chat-page__modal-row"
            @click="pickDmPeer(row)"
          >
            <span class="chat-page__modal-row-name">{{ row.display_name?.trim() || row.email }}</span>
            <span class="chat-page__modal-row-meta">{{ row.position || row.role || '—' }}</span>
          </button>
          <p v-if="!dmLoading && !dmResults.length" class="chat-page__empty">Никого не найдено</p>
        </div>
      </div>
    </div>

    <!-- Модалка: группа (только руководитель) -->
    <div
      v-if="groupModalOpen"
      class="chat-page__modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Новая команда"
      @click.self="groupModalOpen = false"
    >
      <div class="chat-page__modal" @click.stop>
        <div class="chat-page__modal-head">
          <h2 class="chat-page__modal-title">Новая команда</h2>
          <button type="button" class="chat-page__modal-close" aria-label="Закрыть" @click="groupModalOpen = false">×</button>
        </div>
        <label class="chat-page__modal-label">Название</label>
        <input v-model="groupTitle" type="text" class="chat-page__modal-input" placeholder="Например: Бригада поля №3" />
        <p class="chat-page__modal-hint">Выберите участников (вы будете добавлены автоматически).</p>
        <div class="chat-page__modal-list chat-page__modal-list--scroll">
          <label v-for="row in groupEmployees" :key="row.id" class="chat-page__check-row">
            <input type="checkbox" :checked="groupSelected.has(row.id)" @change="toggleGroupMember(row.id)" />
            <span>{{ row.display_name?.trim() || row.email }}</span>
            <span class="chat-page__modal-row-meta">{{ row.position || '' }}</span>
          </label>
        </div>
        <div class="chat-page__modal-footer">
          <button type="button" class="chat-page__toolbar-btn" :disabled="groupBusy" @click="groupModalOpen = false">Отмена</button>
          <button type="button" class="chat-page__toolbar-btn chat-page__toolbar-btn--primary" :disabled="groupBusy" @click="submitGroup">
            {{ groupBusy ? 'Создание…' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-height: min(720px, calc(100dvh - 140px));
  max-height: calc(100dvh - 120px);
}

@media (min-width: 900px) {
  .chat-page {
    flex-direction: row;
    align-items: stretch;
    gap: var(--space-md);
  }
}

.chat-page__list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
  max-height: 42vh;
}

@media (min-width: 900px) {
  .chat-page__list {
    flex: 0 0 380px;
    width: 380px;
    max-height: none;
  }
}

.chat-page__list-head {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.chat-page__search-wrap {
  position: relative;
}

.chat-page__search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  display: flex;
  pointer-events: none;
}

.chat-page__search {
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: none;
  border-radius: 12px;
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.chat-page__search:focus {
  outline: 2px solid var(--accent-green);
  outline-offset: 1px;
}

.chat-page__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.chat-page__tab {
  border: none;
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 500;
  background: transparent;
  color: var(--text-secondary);
  transition: background 0.15s ease, color 0.15s ease;
}

.chat-page__tab:hover {
  background: var(--row-hover-bg);
}

.chat-page__tab--active {
  background: var(--nav-active-bg);
  color: var(--nav-active-text);
}

.chat-page__list-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.chat-page__row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 16px;
  border: none;
  border-bottom: 1px solid var(--border-color);
  border-left: 4px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
  color: inherit;
}

.chat-page__row:hover {
  background: var(--row-hover-bg);
}

.chat-page__row--active {
  background: var(--nav-active-bg);
  border-left-color: var(--nav-active-bar);
}

.chat-page__row-av-wrap {
  position: relative;
  flex-shrink: 0;
}

.chat-page__av {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.125rem;
}

.chat-page__av--blue {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}
.chat-page__av--orange {
  background: rgba(234, 88, 12, 0.12);
  color: #ea580c;
}
.chat-page__av--purple {
  background: rgba(147, 51, 234, 0.12);
  color: #9333ea;
}
.chat-page__av--teal {
  background: rgba(13, 148, 136, 0.12);
  color: #0d9488;
}
.chat-page__av--rose {
  background: rgba(225, 29, 72, 0.1);
  color: #e11d48;
}

[data-theme='dark'] .chat-page__av--blue {
  background: rgba(59, 130, 246, 0.22);
  color: #93c5fd;
}
[data-theme='dark'] .chat-page__av--orange {
  background: rgba(234, 88, 12, 0.2);
  color: #fdba74;
}
[data-theme='dark'] .chat-page__av--purple {
  background: rgba(147, 51, 234, 0.22);
  color: #d8b4fe;
}
[data-theme='dark'] .chat-page__av--teal {
  background: rgba(13, 148, 136, 0.22);
  color: #5eead4;
}
[data-theme='dark'] .chat-page__av--rose {
  background: rgba(225, 29, 72, 0.2);
  color: #fda4af;
}

.chat-page__online {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--bg-panel);
}
.chat-page__online--on {
  background: #22c55e;
}
.chat-page__online--off {
  background: #9ca3af;
}

.chat-page__row-main {
  flex: 1;
  min-width: 0;
  margin-left: 16px;
}

.chat-page__row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.chat-page__row-name {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-page__row-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.chat-page__row-time--accent {
  color: var(--accent-green);
  font-weight: 600;
}

.chat-page__row-role {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.chat-page__row-preview {
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-page__preview-check {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.chat-page__unread-badge {
  margin-left: 8px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent-green);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-page__empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* Thread */
.chat-page__thread {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.chat-page__thread-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.chat-page__thread-user {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.chat-page__thread-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.25;
}

.chat-page__thread-meta {
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-page__group-logo-btn {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  line-height: 0;
  flex-shrink: 0;
}

.chat-page__group-logo-btn:focus-visible {
  outline: 2px solid var(--accent-green, #16a34a);
  outline-offset: 3px;
}

.chat-page__group-logo-btn:hover .chat-page__av,
.chat-page__group-logo-btn:focus-visible .chat-page__av {
  filter: brightness(0.97);
}

[data-theme='dark'] .chat-page__group-logo-btn:hover .chat-page__av,
[data-theme='dark'] .chat-page__group-logo-btn:focus-visible .chat-page__av {
  filter: brightness(1.08);
}

.chat-page__group-participants-btn {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: inherit;
  color: inherit;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, currentColor 35%, transparent);
  text-underline-offset: 3px;
  border-radius: 4px;
}

.chat-page__group-participants-btn:hover,
.chat-page__group-participants-btn:focus-visible {
  color: var(--text-primary);
  text-decoration-color: currentColor;
}

.chat-page__group-participants-btn:focus-visible {
  outline: 2px solid var(--accent-green, #16a34a);
  outline-offset: 2px;
}

.chat-page__dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--border-color);
}

.chat-page__status-on {
  color: #16a34a;
  font-weight: 600;
}

.chat-page__status-off {
  color: var(--text-secondary);
  font-weight: 500;
}

.chat-page__thread-actions {
  display: flex;
  gap: 4px;
}

.chat-page__thread-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.chat-page__chat-loading {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  background: color-mix(in srgb, var(--agri-bg) 55%, var(--bg-panel));
}

[data-theme='dark'] .chat-page__chat-loading {
  background: color-mix(in srgb, var(--bg-base) 80%, var(--bg-panel));
}

.chat-page__chat-loading-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-secondary);
  animation: chat-loading-pulse 1.2s ease-in-out infinite;
}

@keyframes chat-loading-pulse {
  0%,
  100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}

.chat-page__thread-loaded {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-page__group-roster {
  flex-shrink: 0;
  padding: 12px 16px 14px;
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  background: color-mix(in srgb, var(--agri-bg) 40%, var(--bg-panel));
}

[data-theme='dark'] .chat-page__group-roster {
  border-bottom-color: color-mix(in srgb, var(--text-primary) 12%, transparent);
  background: color-mix(in srgb, var(--bg-base) 70%, var(--bg-panel));
}

.chat-page__group-roster-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.chat-page__group-roster-title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.chat-page__group-roster-sub {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.chat-page__group-roster-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.chat-page__group-roster-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(220px, 35vh);
  overflow-y: auto;
}

.chat-page__group-roster-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-panel) 85%, transparent);
}

[data-theme='dark'] .chat-page__group-roster-item {
  background: color-mix(in srgb, var(--bg-base) 50%, var(--bg-panel));
}

.chat-page__group-roster-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-page__group-roster-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-page__group-roster-you {
  font-weight: 500;
  color: var(--text-secondary);
}

.chat-page__group-roster-role {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.chat-page__group-roster-status {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.35;
  text-transform: none;
}

.chat-page__group-roster-status--on {
  color: var(--accent-green);
}

.chat-page__group-roster-status--off {
  color: var(--text-secondary);
}

.chat-page__spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border: 3px solid color-mix(in srgb, var(--accent-green) 25%, transparent);
  border-top-color: var(--accent-green);
  border-radius: 50%;
  animation: chat-spin 0.75s linear infinite;
}

.chat-page__spinner--sm {
  width: 22px;
  height: 22px;
  border-width: 2px;
}

.chat-page__spinner--lg {
  width: 40px;
  height: 40px;
  border-width: 3px;
}

@keyframes chat-spin {
  to {
    transform: rotate(360deg);
  }
}

.chat-page__list-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  color: var(--text-secondary);
}

.chat-page__list-loader-text {
  font-size: 0.8125rem;
  font-weight: 500;
}

.chat-page__toolbar-btn--refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.chat-page__toolbar-btn--icon {
  padding: 8px 10px;
  min-width: 40px;
}

.chat-page__toolbar-refresh-svg--spin {
  animation: chat-spin 0.8s linear infinite;
}

.chat-page__thread-refresh-ico--spin {
  animation: chat-spin 0.8s linear infinite;
}

.chat-page__icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.chat-page__icon-btn:hover:not(:disabled) {
  background: var(--row-hover-bg);
}

.chat-page__icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chat-page__messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: color-mix(in srgb, var(--agri-bg) 55%, var(--bg-panel));
}

[data-theme='dark'] .chat-page__messages {
  background: color-mix(in srgb, var(--bg-base) 80%, var(--bg-panel));
}

.chat-page__date-pill-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.chat-page__date-pill {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--chip-bg);
  color: var(--text-secondary);
}

.chat-page__no-messages {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
  padding: 32px 16px;
}

.chat-page__msg-row {
  display: flex;
  gap: 12px;
  max-width: 48rem;
  margin-bottom: 24px;
  align-items: flex-start;
}

.chat-page__msg-row--out {
  margin-left: auto;
  flex-direction: row;
  justify-content: flex-end;
}

.chat-page__msg-av {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4px;
}

.chat-page__msg-av--me {
  background: var(--accent-green);
  color: #fff;
}

.chat-page__msg-av-spacer {
  width: 32px;
  flex-shrink: 0;
}

.chat-page__msg-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  min-width: 0;
}

.chat-page__msg-col--out {
  align-items: flex-end;
}

.chat-page__bubble {
  padding: 12px 20px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.625;
  box-shadow: var(--shadow-card);
}

.chat-page__bubble p {
  margin: 0;
}

.chat-page__bubble--in {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-top-left-radius: 4px;
}

.chat-page__bubble--out {
  background: var(--accent-green);
  color: #fff;
  border-top-right-radius: 4px;
}

.chat-page__attach {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  max-width: 16rem;
  cursor: pointer;
  margin-top: 4px;
  border-top-left-radius: 4px;
  transition: background 0.15s ease;
}

.chat-page__attach:hover {
  background: var(--bg-panel-hover);
}

.chat-page__attach--out {
  border-top-right-radius: 4px;
  border-top-left-radius: 12px;
}

.chat-page__attach-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-page__attach-meta {
  min-width: 0;
  flex: 1;
}

.chat-page__attach-name {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-page__attach-size {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.chat-page__msg-foot {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-left: 4px;
}

.chat-page__msg-foot--out {
  margin-left: 0;
  margin-right: 4px;
  flex-direction: row-reverse;
}

.chat-page__read-icon {
  color: #3b82f6;
  flex-shrink: 0;
}

.chat-page__composer-wrap {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  background: var(--bg-panel);
}

.chat-page__textarea:disabled,
.chat-page__composer-icon:disabled,
.chat-page__send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chat-page__composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.chat-page__composer:focus-within {
  border-color: var(--accent-green);
  box-shadow: 0 0 0 1px var(--accent-green);
}

.chat-page__composer-icon {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: 12px;
  display: flex;
  flex-shrink: 0;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.chat-page__composer-icon:hover {
  color: var(--accent-green);
  background: var(--bg-panel);
}

.chat-page__textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  min-height: 44px;
  max-height: 8rem;
  padding: 10px 4px;
  font-size: 15px;
  color: var(--text-primary);
  font-family: inherit;
}

.chat-page__textarea:focus {
  outline: none;
}

.chat-page__textarea::placeholder {
  color: var(--text-secondary);
  opacity: 0.85;
}

.chat-page__composer-right {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.chat-page__send {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: none;
  background: var(--accent-green);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  transition: background 0.15s ease;
  box-shadow: var(--shadow-card);
}

.chat-page__send:hover {
  background: var(--accent-green-hover);
}

.chat-page__hint {
  margin: 8px 8px 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.chat-page__warn,
.chat-page__err {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 0.875rem;
  margin: 0 0 var(--space-sm);
}

.chat-page__warn {
  background: var(--chip-bg);
  color: var(--text-secondary);
}

.chat-page__err {
  background: rgba(185, 28, 28, 0.12);
  color: var(--danger-red);
}

.chat-page__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.chat-page__toolbar-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.chat-page__toolbar-btn:hover:not(:disabled) {
  background: var(--row-hover-bg);
}

.chat-page__toolbar-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-page__toolbar-btn--primary {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #fff;
}

.chat-page__toolbar-btn--primary:hover:not(:disabled) {
  background: var(--accent-green-hover);
  border-color: var(--accent-green-hover);
}

.chat-page__thread-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  color: var(--text-secondary);
  font-size: 0.9375rem;
  text-align: center;
}

.chat-page__modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: var(--modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.chat-page__modal {
  width: 100%;
  max-width: 420px;
  max-height: min(560px, 90dvh);
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  padding: 0 0 16px;
  display: flex;
  flex-direction: column;
}

.chat-page__modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color);
}

.chat-page__modal-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.chat-page__modal-close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px 8px;
}

.chat-page__modal-search,
.chat-page__modal-input {
  margin: 12px 18px 0;
  width: calc(100% - 36px);
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.chat-page__modal-label {
  display: block;
  margin: 12px 18px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.chat-page__modal-hint {
  margin: 8px 18px 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.chat-page__modal-list {
  margin-top: 12px;
  padding: 0 8px;
  max-height: 240px;
  overflow-y: auto;
}

.chat-page__modal-list--scroll {
  max-height: 220px;
}

.chat-page__modal-row {
  width: calc(100% - 16px);
  margin: 0 8px 6px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--chip-bg);
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: inherit;
}

.chat-page__modal-row:hover {
  border-color: var(--border-color);
  background: var(--row-hover-bg);
}

.chat-page__modal-row-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.chat-page__modal-row-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.chat-page__check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin: 0 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.chat-page__check-row:hover {
  background: var(--row-hover-bg);
}

.chat-page__modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 18px 0;
  margin-top: 12px;
  border-top: 1px solid var(--border-color);
}
</style>
