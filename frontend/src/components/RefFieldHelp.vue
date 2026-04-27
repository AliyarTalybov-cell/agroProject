<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  text: string
  to: RouteLocationRaw
  linkLabel?: string
}>(), {
  linkLabel: 'Открыть раздел',
})
</script>

<template>
  <span class="ref-help" tabindex="0" aria-label="Подсказка по справочнику">
    <span class="ref-help-icon">?</span>
    <span class="ref-help-tooltip">
      <span class="ref-help-text">{{ text }}</span>
      <RouterLink :to="to" class="ref-help-link">{{ linkLabel }}</RouterLink>
    </span>
  </span>
</template>

<style scoped>
.ref-help {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  vertical-align: middle;
  outline: none;
}

.ref-help::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 12px;
}

.ref-help-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  background: var(--bg-panel);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
}

.ref-help-tooltip {
  position: absolute;
  left: 50%;
  top: calc(100% + 6px);
  transform: translateX(-50%);
  z-index: 30;
  min-width: 220px;
  max-width: 280px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  display: none;
  color: var(--text-primary);
}

.ref-help:hover .ref-help-tooltip,
.ref-help:focus .ref-help-tooltip,
.ref-help:focus-within .ref-help-tooltip {
  display: block;
}

.ref-help-text {
  display: block;
  font-size: 12px;
  line-height: 1.35;
}

.ref-help-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-green);
  text-decoration: none;
}

.ref-help-link:hover {
  text-decoration: underline;
}
</style>
