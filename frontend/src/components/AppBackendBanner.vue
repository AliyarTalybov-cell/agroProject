<script setup lang="ts">
defineProps<{
  message: string
  checking?: boolean
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="app-backend-banner" role="alert">
    <div class="app-backend-banner__body">
      <p class="app-backend-banner__title">Нет связи с базой данных</p>
      <p class="app-backend-banner__text">{{ message }}</p>
      <p class="app-backend-banner__hint">
        Интерфейс доступен, но данные не загрузятся, пока сервер не ответит. Меню и навигация работают.
      </p>
    </div>
    <button type="button" class="app-backend-banner__retry" :disabled="checking" @click="emit('retry')">
      {{ checking ? 'Проверка…' : 'Повторить' }}
    </button>
  </div>
</template>

<style scoped>
.app-backend-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: var(--space-md);
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(185, 28, 28, 0.28);
  background: rgba(185, 28, 28, 0.08);
}

.app-backend-banner__title {
  margin: 0 0 4px;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary);
}

.app-backend-banner__text {
  margin: 0;
  font-size: 0.86rem;
  color: var(--danger-red, #b91c1c);
  line-height: 1.45;
}

.app-backend-banner__hint {
  margin: 6px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.app-backend-banner__retry {
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.app-backend-banner__retry:hover:not(:disabled) {
  background: var(--bg-panel-hover);
  border-color: color-mix(in srgb, var(--accent-green) 40%, var(--border-color));
}

.app-backend-banner__retry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

[data-theme='dark'] .app-backend-banner {
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.35);
}
</style>
