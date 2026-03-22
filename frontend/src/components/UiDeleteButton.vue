<script setup lang="ts">
import { useId } from 'vue'
import UiLoadingBar from '@/components/UiLoadingBar.vue'

withDefaults(
  defineProps<{
    disabled?: boolean
    loading?: boolean
    ariaLabel?: string
    /** Нативная подсказка при наведении (вместо раскрывающегося текста) */
    title?: string
    /** Алиас для title — длинные фразы («Удалить задачу» и т.д.) */
    hoverLabel?: string
    size?: 'xs' | 'sm' | 'md' | 'lg'
    /** @deprecated больше не влияет — кнопка всегда круглая */
    wide?: boolean
  }>(),
  {
    ariaLabel: 'Удалить',
    title: '',
    hoverLabel: 'Удалить',
    size: 'sm',
    wide: false,
  },
)

const emit = defineEmits<{ click: [e: MouseEvent] }>()

const clipUid = useId()

function onClick(e: MouseEvent) {
  emit('click', e)
}

function tipTitle(title: string, hoverLabel: string, loading: boolean) {
  if (loading) return undefined
  const t = title?.trim()
  if (t) return t
  return hoverLabel || undefined
}
</script>

<template>
  <button
    type="button"
    class="ui-del-btn"
    :class="[`ui-del-btn--${size}`, { 'ui-del-btn--loading': loading }]"
    :disabled="disabled || loading"
    :aria-label="loading ? 'Удаление…' : ariaLabel"
    :title="tipTitle(title, hoverLabel, loading)"
    @click="onClick"
  >
    <span class="ui-del-btn__icon-wrap" aria-hidden="true">
      <span class="ui-del-btn__bin">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 69 14"
          class="ui-del-btn__svg ui-del-btn__bin-top"
        >
          <g :clip-path="`url(#${clipUid}-top)`">
            <path
              fill="currentColor"
              d="M20.8232 2.62734L19.9948 4.21304C19.8224 4.54309 19.4808 4.75 19.1085 4.75H4.92857C2.20246 4.75 0 6.87266 0 9.5C0 12.1273 2.20246 14.25 4.92857 14.25H64.0714C66.7975 14.25 69 12.1273 69 9.5C69 6.87266 66.7975 4.75 64.0714 4.75H49.8915C49.5192 4.75 49.1776 4.54309 49.0052 4.21305L48.1768 2.62734C47.3451 1.00938 45.6355 0 43.7719 0H25.2281C23.3645 0 21.6549 1.00938 20.8232 2.62734ZM64.0023 20.0648C64.0397 19.4882 63.5822 19 63.0044 19H5.99556C5.4178 19 4.96025 19.4882 4.99766 20.0648L8.19375 69.3203C8.44018 73.0758 11.6746 76 15.5712 76H53.4288C57.3254 76 60.5598 73.0758 60.8062 69.3203L64.0023 20.0648Z"
            />
          </g>
          <defs>
            <clipPath :id="`${clipUid}-top`">
              <rect width="69" height="14" fill="white" />
            </clipPath>
          </defs>
        </svg>

        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 69 57"
          class="ui-del-btn__svg ui-del-btn__bin-bottom"
        >
          <g :clip-path="`url(#${clipUid}-bot)`">
            <path
              fill="currentColor"
              d="M20.8232 -16.3727L19.9948 -14.787C19.8224 -14.4569 19.4808 -14.25 19.1085 -14.25H4.92857C2.20246 -14.25 0 -12.1273 0 -9.5C0 -6.8727 2.20246 -4.75 4.92857 -4.75H64.0714C66.7975 -4.75 69 -6.8727 69 -9.5C69 -12.1273 66.7975 -14.25 64.0714 -14.25H49.8915C49.5192 -14.25 49.1776 -14.4569 49.0052 -14.787L48.1768 -16.3727C47.3451 -17.9906 45.6355 -19 43.7719 -19H25.2281C23.3645 -19 21.6549 -17.9906 20.8232 -16.3727ZM64.0023 1.0648C64.0397 0.4882 63.5822 0 63.0044 0H5.99556C5.4178 0 4.96025 0.4882 4.99766 1.0648L8.19375 50.3203C8.44018 54.0758 11.6746 57 15.5712 57H53.4288C57.3254 57 60.5598 54.0758 60.8062 50.3203L64.0023 1.0648Z"
            />
          </g>
          <defs>
            <clipPath :id="`${clipUid}-bot`">
              <rect width="69" height="57" fill="white" />
            </clipPath>
          </defs>
        </svg>
      </span>
    </span>
    <UiLoadingBar
      v-if="loading"
      size="micro"
      hide-label
      class="ui-del-btn__loading-bar"
    />
  </button>
</template>

<style scoped>
/* Uiverse / vinodjangid07: круг в цветах портала + красный hover + крышка */
.ui-del-btn {
  --ui-del-bg: color-mix(in srgb, var(--accent-green) 82%, #121816);
  box-sizing: border-box;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: var(--ui-del-bg);
  font-family: inherit;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  overflow: hidden;
  vertical-align: middle;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
}

[data-theme='dark'] .ui-del-btn {
  --ui-del-bg: color-mix(in srgb, var(--accent-green) 42%, #0c120e);
  background-color: var(--ui-del-bg);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--accent-green) 22%, rgba(0, 0, 0, 0.5));
}

.ui-del-btn:is(:hover, :focus-visible):not(:disabled) {
  background-color: rgb(255, 69, 69);
}

.ui-del-btn__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.ui-del-btn__bin {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: gap 0.3s ease;
}

.ui-del-btn:is(:hover, :focus-visible):not(:disabled) .ui-del-btn__bin {
  gap: 0;
}

.ui-del-btn__svg {
  width: var(--ui-bin-svg);
  height: auto;
  display: block;
  flex-shrink: 0;
  color: #fff;
}

.ui-del-btn__svg path {
  fill: currentColor;
}

.ui-del-btn__bin-top {
  transform-origin: bottom right;
  transition: transform 0.5s ease;
}

.ui-del-btn:is(:hover, :focus-visible):not(:disabled) .ui-del-btn__bin-top {
  transform: rotate(160deg);
}

.ui-del-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, rgb(255, 69, 69) 70%, white);
  outline-offset: 3px;
}

.ui-del-btn:disabled,
.ui-del-btn--loading {
  opacity: 0.55;
  cursor: not-allowed;
}

.ui-del-btn--xs {
  --ui-bin-svg: 7px;
  width: 26px;
  height: 26px;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-green) 20%, rgba(0, 0, 0, 0.08));
}
.ui-del-btn--xs:is(:hover, :focus-visible):not(:disabled) {
  box-shadow: 0 0 14px rgba(255, 69, 69, 0.35);
}

.ui-del-btn--sm {
  --ui-bin-svg: 9px;
  width: 32px;
  height: 32px;
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent-green) 20%, rgba(0, 0, 0, 0.08));
}
.ui-del-btn--sm:is(:hover, :focus-visible):not(:disabled) {
  box-shadow: 0 0 16px rgba(255, 69, 69, 0.38);
}

.ui-del-btn--md {
  --ui-bin-svg: 11px;
  width: 40px;
  height: 40px;
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent-green) 22%, rgba(0, 0, 0, 0.1));
}
.ui-del-btn--md:is(:hover, :focus-visible):not(:disabled) {
  box-shadow: 0 0 18px rgba(255, 69, 69, 0.4);
}

.ui-del-btn--lg {
  --ui-bin-svg: 12px;
  width: 50px;
  height: 50px;
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent-green) 22%, rgba(0, 0, 0, 0.12));
}
.ui-del-btn--lg:is(:hover, :focus-visible):not(:disabled) {
  box-shadow: 0 0 22px rgba(255, 69, 69, 0.42);
}

.ui-del-btn:disabled:hover,
.ui-del-btn.ui-del-btn--loading:hover {
  background-color: var(--ui-del-bg);
}
[data-theme='dark'] .ui-del-btn:disabled:hover,
[data-theme='dark'] .ui-del-btn.ui-del-btn--loading:hover {
  background-color: var(--ui-del-bg);
}

.ui-del-btn--loading .ui-del-btn__icon-wrap {
  opacity: 0;
}

.ui-del-btn__loading-bar {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.ui-del-btn--xs .ui-del-btn__loading-bar :deep(.ui-loading-bar) {
  transform: scale(0.34);
}
.ui-del-btn--sm .ui-del-btn__loading-bar :deep(.ui-loading-bar) {
  transform: scale(0.42);
}
.ui-del-btn--md .ui-del-btn__loading-bar :deep(.ui-loading-bar) {
  transform: scale(0.52);
}
.ui-del-btn--lg .ui-del-btn__loading-bar :deep(.ui-loading-bar) {
  transform: scale(0.64);
}
</style>
