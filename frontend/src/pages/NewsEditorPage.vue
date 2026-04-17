<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAuthUser } from '@/stores/auth'
import { createNewsPost, getNewsPostById, isSupabaseConfigured, updateNewsPost, uploadNewsImage } from '@/lib/newsSupabase'

const route = useRoute()
const router = useRouter()
const isEdit = computed(() => Boolean(route.params.id))
const postId = computed(() => String(route.params.id || ''))

const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const uploadingCover = ref(false)
const uploadingGallery = ref(false)
const error = ref<string | null>(null)

const form = ref({
  title: '',
  excerpt: '',
  coverExcerptPosition: 'left-bottom' as 'left-top' | 'right-top' | 'left-bottom' | 'right-bottom',
  coverImageUrl: '',
  publishedAt: '',
  content: '',
  galleryText: '',
})

const pageTitle = computed(() => (isEdit.value ? 'Редактирование новости' : 'Новая новость'))

function nowLocalDateTime(): string {
  const d = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseGallery(value: string): string[] {
  return value.split('\n').map((x) => x.trim()).filter(Boolean)
}

async function loadData() {
  if (!isEdit.value || !isSupabaseConfigured()) {
    form.value.publishedAt = nowLocalDateTime()
    return
  }
  loading.value = true
  error.value = null
  try {
    const row = await getNewsPostById(postId.value)
    if (!row) {
      error.value = 'Новость не найдена'
      return
    }
    form.value = {
      title: row.title,
      excerpt: row.excerpt ?? '',
      coverExcerptPosition: row.cover_excerpt_position ?? 'left-bottom',
      coverImageUrl: row.cover_image_url ?? '',
      publishedAt: row.published_at.slice(0, 16),
      content: row.content,
      galleryText: (row.gallery_urls ?? []).join('\n'),
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить новость'
  } finally {
    loading.value = false
  }
}

function goBack() {
  if (isEdit.value) {
    void router.push({ name: 'news-details', params: { id: postId.value } })
    return
  }
  void router.push({ name: 'news' })
}

async function savePost() {
  await persistPost(false)
}

async function publishPost() {
  await persistPost(true)
}

async function persistPost(publishNow: boolean) {
  if (!isSupabaseConfigured()) {
    error.value = 'Supabase не настроен'
    return
  }
  if (!form.value.title.trim() || !form.value.content.trim()) {
    error.value = 'Заполните заголовок и основной текст'
    return
  }
  if (publishNow) publishing.value = true
  else saving.value = true
  error.value = null
  try {
    const galleryUrls = parseGallery(form.value.galleryText)
    const publishedIso = publishNow
      ? new Date().toISOString()
      : new Date(form.value.publishedAt || nowLocalDateTime()).toISOString()
    if (isEdit.value) {
      await updateNewsPost(postId.value, {
        title: form.value.title,
        excerpt: form.value.excerpt || null,
        cover_excerpt_position: form.value.coverExcerptPosition,
        cover_image_url: form.value.coverImageUrl || null,
        content: form.value.content,
        gallery_urls: galleryUrls,
        published_at: publishedIso,
      })
      form.value.publishedAt = publishedIso.slice(0, 16)
      void router.push({ name: 'news-details', params: { id: postId.value } })
    } else {
      const createdBy = getAuthUser()?.id ?? null
      const row = await createNewsPost({
        title: form.value.title,
        excerpt: form.value.excerpt || null,
        cover_excerpt_position: form.value.coverExcerptPosition,
        cover_image_url: form.value.coverImageUrl || null,
        content: form.value.content,
        gallery_urls: galleryUrls,
        published_at: publishedIso,
        created_by: createdBy,
      })
      form.value.publishedAt = publishedIso.slice(0, 16)
      void router.push({ name: 'news-details', params: { id: row.id } })
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : publishNow ? 'Не удалось опубликовать новость' : 'Не удалось сохранить новость'
  } finally {
    if (publishNow) publishing.value = false
    else saving.value = false
  }
}

async function onCoverFilePick(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file || !isSupabaseConfigured()) return
  uploadingCover.value = true
  error.value = null
  try {
    const url = await uploadNewsImage(file, 'covers')
    form.value.coverImageUrl = url
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить обложку'
  } finally {
    uploadingCover.value = false
    if (target) target.value = ''
  }
}

async function onGalleryFilesPick(event: Event) {
  const target = event.target as HTMLInputElement | null
  const files = Array.from(target?.files ?? [])
  if (!files.length || !isSupabaseConfigured()) return
  uploadingGallery.value = true
  error.value = null
  try {
    const uploadedUrls: string[] = []
    for (const file of files) {
      uploadedUrls.push(await uploadNewsImage(file, 'gallery'))
    }
    const existing = parseGallery(form.value.galleryText)
    form.value.galleryText = [...existing, ...uploadedUrls].join('\n')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить фото для галереи'
  } finally {
    uploadingGallery.value = false
    if (target) target.value = ''
  }
}

onMounted(() => void loadData())
</script>

<template>
  <section class="news-editor">
    <header class="news-editor-top">
      <h1 class="page-title">{{ pageTitle }}</h1>
      <button type="button" class="news-editor-back" @click="goBack">Отмена</button>
    </header>

    <p class="news-editor-hint">
      Заполните шаблон: добавьте фото (URL), заголовок, подзаголовок и текстовые блоки.
    </p>
    <p v-if="error" class="news-editor-error">{{ error }}</p>

    <form class="news-editor-form" @submit.prevent="savePost">
      <label class="news-field">
        <span>Заголовок</span>
        <input v-model.trim="form.title" type="text" maxlength="160" placeholder="Например: Агропромкомплектация готовится к посевной кампании - 2026" />
      </label>

      <label class="news-field">
        <span>Короткое описание</span>
        <input v-model.trim="form.excerpt" type="text" maxlength="220" placeholder="Короткая подводка для карточки новости" />
      </label>

      <label class="news-field">
        <span>Позиция короткого описания на обложке</span>
        <select v-model="form.coverExcerptPosition" class="news-select">
          <option value="left-top">Слева сверху</option>
          <option value="right-top">Справа сверху</option>
          <option value="left-bottom">Слева снизу</option>
          <option value="right-bottom">Справа снизу</option>
        </select>
      </label>

      <div class="news-grid-two">
        <label class="news-field">
          <span>URL обложки</span>
          <input v-model.trim="form.coverImageUrl" type="url" placeholder="https://..." />
          <div class="news-upload-row">
            <label class="news-upload-btn">
              <input type="file" accept="image/*" :disabled="uploadingCover || saving || publishing || loading" @change="onCoverFilePick" />
              {{ uploadingCover ? 'Загрузка...' : 'Загрузить обложку' }}
            </label>
          </div>
        </label>
        <label class="news-field">
          <span>Дата публикации</span>
          <input v-model="form.publishedAt" type="datetime-local" />
        </label>
      </div>

      <label class="news-field">
        <span>Основной текст новости</span>
        <textarea v-model="form.content" rows="14" placeholder="Пишите текст блоками, разделяя абзацы пустой строкой. Для цитаты можно начать блок с «...»."></textarea>
      </label>

      <label class="news-field">
        <span>Галерея (по одному URL на строку)</span>
        <textarea v-model="form.galleryText" rows="5" placeholder="https://...\nhttps://..." />
        <div class="news-upload-row">
          <label class="news-upload-btn">
            <input type="file" multiple accept="image/*" :disabled="uploadingGallery || saving || publishing || loading" @change="onGalleryFilesPick" />
            {{ uploadingGallery ? 'Загрузка фото...' : 'Добавить фото в галерею' }}
          </label>
        </div>
      </label>

      <div class="news-editor-actions">
        <button type="button" class="news-editor-btn news-editor-btn--ghost" :disabled="saving || publishing || loading" @click="goBack">Отмена</button>
        <button type="submit" class="news-editor-btn news-editor-btn--primary" :disabled="saving || publishing || loading">
          {{ saving ? 'Сохранение...' : 'Сохранить новость' }}
        </button>
        <button type="button" class="news-editor-btn news-editor-btn--publish" :disabled="saving || publishing || loading" @click="publishPost">
          {{ publishing ? 'Публикация...' : 'Опубликовать' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.news-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.news-editor-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.news-editor-back {
  height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.16s ease;
}
.news-editor-back:hover {
  transform: translateY(-1px);
  background: var(--bg-panel-hover);
  border-color: color-mix(in srgb, var(--accent-green) 40%, var(--border-color));
}
.news-editor-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9375rem;
}
.news-editor-error {
  margin: 0;
  color: #b42318;
  font-size: 0.9rem;
}
.news-editor-form {
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  min-width: 0;
}
.news-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.news-field > span {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}
.news-field input,
.news-field textarea,
.news-select {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.9375rem;
  font-weight: 400;
  color: var(--text-primary);
  background: #fff;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
}
.news-field input::placeholder,
.news-field textarea::placeholder {
  color: var(--text-secondary);
}
.news-field input:focus,
.news-field textarea:focus,
.news-select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent-green) 58%, var(--border-color));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-green) 18%, transparent);
}
.news-field textarea {
  resize: vertical;
  min-height: 140px;
  line-height: 1.45;
}
.news-select {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%), linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%);
  background-position: calc(100% - 18px) calc(1em + 1px), calc(100% - 13px) calc(1em + 1px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.news-grid-two {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.news-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}
.news-upload-row {
  margin-top: 2px;
}
.news-upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  background: #fff;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.16s ease;
}
.news-upload-btn:hover {
  transform: translateY(-1px);
  background: var(--bg-panel-hover);
  border-color: color-mix(in srgb, var(--accent-green) 38%, var(--border-color));
}
.news-upload-btn input {
  display: none;
}
.news-editor-btn {
  height: 40px;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.16s ease, box-shadow 0.2s ease;
}
.news-editor-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}
.news-editor-btn--ghost {
  border-color: var(--border-color);
  background: #fff;
  color: var(--text-primary);
}
.news-editor-btn--ghost:hover:not(:disabled) {
  background: #fff;
  border-color: color-mix(in srgb, var(--accent-green) 35%, var(--border-color));
}

[data-theme='dark'] .news-editor-form,
[data-theme='dark'] .news-field input,
[data-theme='dark'] .news-field textarea,
[data-theme='dark'] .news-select,
[data-theme='dark'] .news-upload-btn,
[data-theme='dark'] .news-editor-btn--ghost,
[data-theme='dark'] .news-editor-btn--ghost:hover:not(:disabled) {
  background: var(--bg-panel);
}
.news-editor-btn--primary {
  background: var(--accent-green);
  color: #fff;
}
.news-editor-btn--primary:hover:not(:disabled) {
  background: var(--accent-green-hover);
  transform: translateY(-1px);
  box-shadow: 0 8px 16px rgba(61, 92, 64, 0.28);
}
.news-editor-btn--publish {
  background: var(--accent-green);
  color: #fff;
}
.news-editor-btn--publish:hover:not(:disabled) {
  background: var(--accent-green-hover);
  transform: translateY(-1px);
  box-shadow: 0 8px 16px rgba(61, 92, 64, 0.28);
}
@media (max-width: 980px) {
  .news-editor-form {
    padding: 12px;
    gap: 11px;
  }
  .news-field textarea {
    min-height: 120px;
  }
}
@media (max-width: 760px) {
  .news-grid-two {
    grid-template-columns: 1fr;
  }
  .news-editor-form {
    padding: 10px;
    gap: 10px;
  }
  .news-editor-actions {
    flex-wrap: wrap;
    justify-content: stretch;
  }
  .news-editor-btn {
    flex: 1;
    min-width: 130px;
  }
}
</style>
