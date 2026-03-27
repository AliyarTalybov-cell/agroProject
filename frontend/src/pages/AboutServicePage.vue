<script setup lang="ts">
import { RouterLink } from 'vue-router'

withDefaults(
  defineProps<{
    /** Вложение в «Обзор»: без full-bleed и отрицательных отступов */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const workflowSteps = [
  {
    n: '01',
    title: 'Вход и роль',
    text: 'Вы заходите под корпоративной учётной записью. Сервер опознаёт вас через Supabase Auth и подставляет роль: руководитель или работник. От этого зависит, какие пункты меню вы увидите и какие списки откроются по умолчанию — «всё хозяйство» или «в основном моё».',
  },
  {
    n: '02',
    title: 'Поля и справочники',
    text: 'Поля — это основа: номер участка, площадь, культура, тип земли, кадастр, кто ответственный, схема участка, если загружена. В той же вкладке заведены справочники: причины простоя, виды работ, типы земли и культуры — всё это потом подхватывается в задачах и на экране оператора.',
  },
  {
    n: '03',
    title: 'Задачи и календарь',
    text: 'В «Задачах» ведётся производственный учёт: сроки, статусы, исполнители, история изменений и переписка по задаче. «Календарь» — отдельный слой планирования дня: события с временем, приоритетами и исполнителями. Руководитель может переключиться на календарь любого сотрудника и увидеть картину без созвонов и таблиц в мессенджере.',
  },
  {
    n: '04',
    title: 'Факт и аналитика',
    text: 'На «Экране оператора» фиксируется то, что реально случилось в поле: операции, техника, простои. Эти данные затем попадают в «Аналитику» — сводки по задачам, технике и операциям за выбранный период, чтобы закрывать смену цифрами, а не только «как вспомним».',
  },
] as const

const hubLinks = [
  {
    to: '/task-management',
    label: 'Задачи',
    note: 'Производственные задачи: кто исполнитель, срок, статус. Есть переключение «мои / все» (в зависимости от роли), история изменений по задаче и переписка прямо в карточке — договорённости не теряются между чатами.',
  },
  {
    to: '/tasks',
    label: 'Календарь',
    note: 'План на день и на месяц: события со временем, приоритетом и исполнителем, можно прикреплять файлы. У руководителя доступен просмотр календаря выбранного сотрудника — удобно стыковать загрузку людей без отдельных отчётов.',
  },
  {
    to: '/equipment',
    label: 'Техника',
    note: 'Каталог машин и агрегатов с карточками. То, что заведено здесь, дальше выбирается на экране оператора и попадает в аналитику — один раз записали парк, дальше везде те же единицы.',
  },
  {
    to: '/mechanic',
    label: 'Экран оператора',
    note: 'Экран для работы из кабины или поля: старт и завершение операции, учёт простоя с причиной из справочника, привязка к полю и технике. Часто показываются задачи из календаря на сегодня — план и факт рядом.',
  },
  {
    to: '/reports',
    label: 'Аналитика',
    note: 'Сводки за выбранный период: что сделали по задачам, как работала техника, какие операции и простои на полях. Руководителю — фильтры по датам и людям, чтобы закрывать период цифрами, а не на словах.',
  },
  {
    to: '/weather',
    label: 'Погода',
    note: 'Прогноз и текущие условия по выбранному населённому пункту. Имеет смысл держать открытым рядом с планированием смены и работ на полях.',
  },
  {
    to: '/chat',
    label: 'Чат',
    note: 'Общая переписка между пользователями портала. Для срочных вопросов и коротких согласований; то, что должно остаться в учёте, лучше дублировать задачей или записью у оператора.',
  },
] as const

const tips = [
  {
    title: 'С чего начать новичку',
    text: 'Начните с «Техники» и «Задач», затем откройте «Календарь» — так быстрее увидеть связку плана работ и учёта.',
  },
  {
    title: 'Про права доступа',
    text: 'Если раздел не отображается, чаще всего это права роли. Имеет смысл проверить интерфейс и под руководителем, и под работником — так проще обучать команду.',
  },
] as const
</script>

<template>
  <div class="about-page page-enter-item" :class="{ 'about-page--embedded': embedded }">
    <header class="about-hero">
      <div class="about-hero-bg" aria-hidden="true">
        <span class="about-blob about-blob--a" />
        <span class="about-blob about-blob--b" />
        <span class="about-hero-grid-pattern" />
      </div>
      <div class="about-container about-hero-layout">
        <div class="about-hero-copy">
          <p class="about-badge">
            <span class="about-badge-dot" aria-hidden="true" />
            О сервисе · мини-презентация
          </p>
          <h1 class="about-title">
            Добро пожаловать в
            <span class="about-title-gradient">АГРОСИСТЕМА</span>
          </h1>
          <div class="about-lead-block">
            <p class="about-lead">
              Это корпоративный веб-портал для сельхозпредприятия: поля, люди, задачи, техника и учёт операций собраны в одном месте, чтобы
              смена жила не в разрозненных чатах и таблицах, а в понятных экранах с общей базой данных.
            </p>
            <p class="about-lead">
              Ниже — без маркетинга: как устроен портал сейчас, как связаны разделы и кому что обычно нужно. Блок
              «Разделы меню» внизу можно использовать как шпаргалку: одна ссылка — один экран, с понятным описанием.
            </p>
          </div>
          <blockquote class="about-pullquote">
            <p>
              Если коротко: <strong>план</strong> (задачи и календарь) и <strong>факт</strong> (экран оператора) встречаются в
              <strong>аналитике</strong> — и всё это стоит на одних и тех же полях, профилях и машинах из каталога.
            </p>
          </blockquote>
        </div>
      </div>
    </header>

    <section class="about-section about-section--why about-band" aria-labelledby="about-why-title">
      <div class="about-container">
      <p class="about-kicker">Зачем всё это</p>
      <h2 id="about-why-title" class="about-h2">Какую проблему решает портал</h2>
      <div class="about-prose about-panel">
        <p>
          В хозяйстве каждый день рождается поток мелочей: кто поехал на какой участок, что обещали закрыть к пятнице, почему простояла
          машина, какая культура на «северном клине». Когда эти сведения держат в голове или в личных переписках, теряются детали, сложно
          передать смену и почти невозможно честно посмотреть на месяц в цифрах.
        </p>
        <p>
          <strong>АГРОСИСТЕМА</strong> предлагает другой порядок: договорились о поле — оно в реестре; поставили задачу — она видна
          исполнителю и руководителю; произошла операция или простой — фиксируется там, где потом легко построить отчёт. Это не замена
          агрономической экспертизы, а «скелет», на который навешиваются ваши процессы.
        </p>
      </div>
      </div>
    </section>

    <section class="about-section about-section--roles" aria-labelledby="about-roles-title">
      <div class="about-container">
      <div class="about-section-head">
        <p class="about-kicker">Люди в системе</p>
        <h2 id="about-roles-title" class="about-h2">Три типичных лица портала</h2>
        <p class="about-section-desc">
          От роли зависит состав меню и доступ к данным других сотрудников — например, к чужим календарям. Ниже — три типовые зоны
          ответственности.
        </p>
      </div>

      <div class="about-role-grid">
        <article class="about-role-card about-role-card--lead">
          <h3 class="about-role-title">Руководитель и агроном-служба</h3>
          <p class="about-role-text">
            Полный доступ к сводкам, отчётам и календарям подразделения. Ведение номенклатуры полей и техники, контроль показателей в
            аналитике, рабочая переписка в чате. Раздел «Сотрудники» — для учёта людей и ролей в организации.
          </p>
          <ul class="about-role-list">
            <li>аналитика по периодам: загрузка, закрытие задач, операции;</li>
            <li>просмотр календарей сотрудников при планировании;</li>
            <li>доступ к данным в соответствии с настроенными правилами безопасности.</li>
          </ul>
        </article>

        <article class="about-role-card">
          <h3 class="about-role-title">Работник и специалист «в поле»</h3>
          <p class="about-role-text">
            Фокус на своих задачах и календаре, прогноз погоды, сведения по выданным участкам и технике. Корпоративные сводки по всему
            хозяйству минимизированы, чтобы не отвлекать от текущей смены.
          </p>
          <ul class="about-role-list">
            <li>назначенные задачи и события календаря;</li>
            <li>поля и техника — в рамках выданных прав;</li>
            <li>внутренний чат портала.</li>
          </ul>
        </article>

        <article class="about-role-card about-role-card--accent">
          <h3 class="about-role-title">Оператор техники</h3>
          <p class="about-role-text">
            Упрощённый экран для кабины и поля: крупные элементы, учёт операций и простоев, привязка к участку и машине, список задач на
            день из календаря.
          </p>
          <ul class="about-role-list">
            <li>операции и техника из единого каталога;</li>
            <li>причины простоя из справочника — для последующих отчётов;</li>
            <li>единый ввод данных без дублирования в отдельные таблицы.</li>
          </ul>
        </article>
      </div>
      </div>
    </section>

    <section class="about-section about-section--tips about-band" aria-labelledby="about-tips-title">
      <div class="about-container">
      <h2 id="about-tips-title" class="visually-hidden">Полезные подсказки</h2>
      <div class="about-tip-grid">
        <div v-for="tip in tips" :key="tip.title" class="about-tip-card">
          <p class="about-tip-title">{{ tip.title }}</p>
          <p class="about-tip-text">{{ tip.text }}</p>
        </div>
      </div>
      </div>
    </section>

    <section class="about-section about-section--steps" aria-labelledby="about-steps-title">
      <div class="about-container">
      <div class="about-section-head about-section-head--center">
        <p class="about-kicker">Сквозной сценарий</p>
        <h2 id="about-steps-title" class="about-h2">От утра до отчёта: четыре крупных шага</h2>
        <p class="about-section-desc maxw-center">
          Это упрощённая «дорожная карта» для новичка. В жизни шаги переплетаются, но логика такая: сначала понять, кто вы в системе и что
          уже заведено, потом планировать, фиксировать факт и смотреть итог.
        </p>
      </div>
      <ol class="about-steps">
        <li v-for="s in workflowSteps" :key="s.n" class="about-step">
          <span class="about-step-num">{{ s.n }}</span>
          <h3 class="about-step-title">{{ s.title }}</h3>
          <p class="about-step-text">{{ s.text }}</p>
        </li>
      </ol>
      </div>
    </section>

    <section class="about-section about-section--deep about-band" aria-labelledby="about-deep-title">
      <div class="about-container">
        <p class="about-kicker">Целостность данных</p>
        <h2 id="about-deep-title" class="about-h2">Один раз завели — везде те же справочники и объекты</h2>
        <div class="about-prose about-prose--compact about-panel">
          <p>
            Поле из реестра, машина из каталога, причина простоя из справочника — это одни и те же записи в базе, которые подтягиваются в
            задачи, календарь, экран оператора и отчёты. Повторно набирать одно и то же в разных «таблицах» не нужно: смысл в сквозной
            связке, а не в наборе изолированных экранов.
          </p>
          <p>
            <strong>Аналитика</strong> опирается на уже введённый факт и план; она не подменяет ввод данных, а помогает увидеть период
            целиком — при условии, что операции и статусы своевременно отражают реальность.
          </p>
        </div>
      </div>
    </section>

    <section class="about-section about-section--links" aria-labelledby="about-links-title">
      <div class="about-container">
      <div class="about-split-card">
        <div class="about-split-body">
          <p class="about-kicker">Быстрые переходы</p>
          <h2 id="about-links-title" class="about-h2 about-h2--compact">Разделы меню — что открывается и зачем</h2>
          <p class="about-section-desc">
            Нажмите на строку — откроется нужный экран. Там же, что и в боковом меню приложения; здесь собрано короткое пояснение, чтобы не
            гадать по названию.
          </p>
          <ul class="about-link-list">
            <li v-for="item in hubLinks" :key="item.to">
              <RouterLink :to="item.to" class="about-link-pill">
                <span class="about-link-label">{{ item.label }}</span>
                <span class="about-link-note">{{ item.note }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>
      </div>
    </section>

    <section class="about-section about-section--tech about-band" aria-labelledby="about-tech-title">
      <div class="about-container">
      <p class="about-kicker">ИТ и внедрение</p>
      <h2 id="about-tech-title" class="about-h2">Технологии и зона ответственности</h2>
      <div class="about-prose about-panel">
        <p>
          Клиентская часть: Vue 3, сборка Vite. Данные, авторизация и файлы (вложения к задачам и календарю) размещаются на стороне
          Supabase (PostgreSQL).
        </p>
        <p>
          Для работоспособности экранов в базе должна быть применена актуальная схема из репозитория (SQL-миграции), а в настройках
          окружения фронтенда указаны адрес проекта и ключ доступа Supabase.
        </p>
        <p>
          Резервное копирование, политика учётных записей, аудит и назначение административных ролей относятся к процессам вашей
          организации. Настоящая страница поясняет функции портала для пользователей и не заменяет внутренние ИТ-регламенты.
        </p>
      </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.about-page {
  --about-green: #1b4d3e;
  --about-green-soft: color-mix(in srgb, var(--accent-green) 12%, var(--bg-base));
  /* Единый стиль «панелей» с текстом */
  --about-surface-radius: 16px;
  --about-surface-border: 1px solid var(--border-color);
  --about-surface-bg: var(--bg-panel);
  --about-surface-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 7%, transparent);
  box-sizing: border-box;
}

[data-theme='dark'] .about-page {
  --about-surface-shadow: 0 1px 4px color-mix(in srgb, #000 45%, transparent);
}

.about-page:not(.about-page--embedded) {
  /* full-bleed внутри main-content-inner */
  width: calc(100% + 64px);
  max-width: none;
  margin: -24px -32px 0;
  padding: 0 0 36px;
}

@media (min-width: 768px) {
  .about-page:not(.about-page--embedded) {
    margin: -32px -32px 0;
  }
}

.about-page--embedded {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0 0 24px;
}

.about-container {
  width: 100%;
  max-width: 1400px;
  margin-left: auto;
  margin-right: auto;
  padding-left: clamp(14px, 3vw, 32px);
  padding-right: clamp(14px, 3vw, 32px);
  box-sizing: border-box;
}

.about-hero {
  position: relative;
  padding: 20px 0 0;
  text-align: left;
  overflow: hidden;
}

.about-hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.about-hero-grid-pattern {
  position: absolute;
  inset: -20% -10% auto -10%;
  height: 120%;
  opacity: 0.35;
  background-image:
    radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--accent-green) 28%, transparent) 1px, transparent 0);
  background-size: 22px 22px;
  mask-image: linear-gradient(180deg, #000 30%, transparent 95%);
}

.about-blob {
  position: absolute;
  border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
  filter: blur(48px);
  opacity: 0.45;
}

.about-blob--a {
  width: min(55vw, 420px);
  height: min(45vw, 340px);
  top: -8%;
  left: -12%;
  background: color-mix(in srgb, var(--accent-green) 22%, transparent);
}

.about-blob--b {
  width: min(50vw, 380px);
  height: min(40vw, 300px);
  bottom: 10%;
  right: -10%;
  background: color-mix(in srgb, #3b82f6 12%, transparent);
}

.about-hero-layout {
  position: relative;
  z-index: 1;
  padding: 8px 0 18px;
}

.about-hero-copy {
  min-width: 0;
  max-width: min(52rem, 100%);
}

.about-hero-copy .about-badge {
  margin-bottom: 14px;
}

.about-hero-copy .about-title {
  margin-bottom: 14px;
}

.about-hero-copy .about-lead-block {
  max-width: none;
  margin: 0 0 16px;
}

.about-hero-copy .about-pullquote {
  max-width: none;
  margin: 0 0 16px;
}

/* Полосы секций: только вертикальные отступы, без цветной подложки и лишних рамок —
   фон как у области контента, «коробки» только у .about-panel / карточек */
.about-band {
  margin-left: 0;
  margin-right: 0;
  padding: clamp(20px, 4vw, 32px) 0;
  background: transparent;
}

.about-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 20px;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
}

.about-badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-green) 25%, transparent);
}

.about-title {
  margin: 0 0 20px;
  font-size: clamp(1.85rem, 4.2vw, 2.85rem);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.about-title-gradient {
  display: block;
  margin-top: 4px;
  background: linear-gradient(135deg, var(--about-green) 0%, var(--accent-green) 55%, color-mix(in srgb, var(--accent-green) 70%, #10b981) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.about-lead-block {
  text-align: left;
  max-width: 42rem;
  margin: 0 auto 24px;
}

.about-lead {
  margin: 0 0 14px;
  font-size: 1.02rem;
  line-height: 1.68;
  color: var(--text-secondary);
}

.about-lead:last-child {
  margin-bottom: 0;
}

.about-pullquote {
  margin: 0 auto 28px;
  max-width: 38rem;
  padding: 18px 20px;
  border-radius: var(--about-surface-radius);
  border: var(--about-surface-border);
  border-left: 4px solid var(--accent-green);
  background: var(--about-surface-bg);
  box-shadow: var(--about-surface-shadow);
  text-align: left;
}

.about-pullquote p {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.6;
  color: var(--text-primary);
}

.about-pullquote strong {
  color: var(--accent-green);
}

.about-prose--compact {
  max-width: min(48rem, 100%);
}

.about-panel {
  padding: 18px 20px;
  border-radius: var(--about-surface-radius);
  border: var(--about-surface-border);
  background: var(--about-surface-bg);
  box-shadow: var(--about-surface-shadow);
}

.about-code {
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--chip-bg, rgba(0, 0, 0, 0.06));
}

.about-hero + .about-section {
  margin-top: 0;
}

.about-section {
  margin-top: clamp(1.65rem, 3.5vw, 2.6rem);
}

.about-section-head {
  margin-bottom: 28px;
  max-width: 46rem;
}

.about-section-head--center {
  text-align: center;
  margin-left: auto;
  margin-right: auto;
  max-width: 40rem;
}

.maxw-center {
  max-width: 38rem;
  margin-left: auto;
  margin-right: auto;
}

.about-kicker {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-green);
}

.about-h2 {
  margin: 0 0 14px;
  font-size: clamp(1.4rem, 3vw, 2.05rem);
  font-weight: 800;
  line-height: 1.22;
  color: var(--text-primary);
}

.about-h2--compact {
  font-size: clamp(1.28rem, 2.5vw, 1.72rem);
}

.about-section-desc {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.62;
  color: var(--text-secondary);
}

.about-section-desc--below {
  margin-bottom: 22px;
  max-width: 40rem;
}

.about-prose p {
  margin: 0 0 14px;
  font-size: 0.98rem;
  line-height: 1.68;
  color: var(--text-secondary);
}

.about-prose p:last-child {
  margin-bottom: 0;
}

.about-prose strong {
  color: var(--text-primary);
}

.about-role-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
  align-items: stretch;
}

@media (min-width: 900px) {
  .about-role-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.about-role-card {
  padding: 20px 18px 22px;
  border-radius: var(--about-surface-radius);
  border: var(--about-surface-border);
  background: var(--about-surface-bg);
  box-shadow: var(--about-surface-shadow);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.about-role-card--lead {
  background: linear-gradient(155deg, var(--about-green) 0%, color-mix(in srgb, var(--about-green) 78%, #0f172a) 100%);
  border: 1px solid color-mix(in srgb, var(--about-green) 45%, var(--border-color));
  box-shadow: var(--about-surface-shadow);
  color: #ecfdf5;
}

.about-role-card--lead .about-role-title {
  color: #fff;
}

.about-role-card--lead .about-role-text {
  color: rgba(236, 253, 245, 0.9);
}

.about-role-card--lead .about-role-list {
  color: rgba(236, 253, 245, 0.88);
}

.about-role-card--lead .about-role-list li::marker {
  color: #6ee7b7;
}

.about-role-card--accent {
  background: var(--about-green-soft);
  border: 1px solid color-mix(in srgb, var(--accent-green) 28%, var(--border-color));
  box-shadow: var(--about-surface-shadow);
}

.about-role-title {
  margin: 0 0 12px;
  font-size: 1.22rem;
  font-weight: 800;
  color: var(--text-primary);
}

.about-role-text {
  margin: 0 0 14px;
  font-size: 0.94rem;
  line-height: 1.6;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.about-role-list {
  margin: auto 0 0;
  padding-left: 1.15rem;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.about-role-list li {
  margin-bottom: 8px;
}

.about-tip-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .about-tip-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.about-tip-card {
  padding: 18px 20px;
  border-radius: var(--about-surface-radius);
  border: var(--about-surface-border);
  background: var(--about-surface-bg);
  box-shadow: var(--about-surface-shadow);
}

.about-tip-title {
  margin: 0 0 8px;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent-green);
}

.about-tip-text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.58;
  color: var(--text-secondary);
}

.about-section--steps {
  padding: 0;
  border: none;
  background: transparent;
}

.about-section--steps .about-container {
  padding-top: clamp(8px, 2vw, 14px);
  padding-bottom: clamp(8px, 2vw, 14px);
  border: none;
  border-radius: 0;
  background: transparent;
}

.about-steps {
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: grid;
  gap: 22px;
  grid-template-columns: 1fr;
}

@media (min-width: 900px) {
  .about-steps {
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
}

.about-step {
  text-align: center;
  padding: 18px 14px 20px;
  border-radius: var(--about-surface-radius);
  border: var(--about-surface-border);
  background: var(--about-surface-bg);
  box-shadow: var(--about-surface-shadow);
}

.about-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 14px;
  border-radius: 50%;
  font-weight: 800;
  font-size: 1rem;
  color: var(--text-secondary);
  background: var(--bg-base);
  border: 2px solid var(--border-color);
}

.about-step:nth-child(4) .about-step-num {
  color: var(--accent-green);
  border-color: color-mix(in srgb, var(--accent-green) 35%, var(--border-color));
}

.about-step-title {
  margin: 0 0 10px;
  font-size: 1.02rem;
  font-weight: 800;
  color: var(--text-primary);
}

.about-step-text {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.52;
  color: var(--text-secondary);
  text-align: left;
}

@media (min-width: 900px) {
  .about-step-text {
    font-size: 0.84rem;
  }
}

.about-split-card {
  border-radius: var(--about-surface-radius);
  border: var(--about-surface-border);
  background: var(--about-surface-bg);
  box-shadow: var(--about-surface-shadow);
  overflow: hidden;
}

.about-split-body {
  padding: 22px 20px 28px;
}

.about-link-list {
  list-style: none;
  margin: 22px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.about-link-list > li {
  display: flex;
  min-height: 0;
}

.about-link-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 16px;
  border-radius: var(--about-surface-radius);
  text-decoration: none;
  color: var(--text-primary);
  background: var(--about-surface-bg);
  border: var(--about-surface-border);
  box-shadow: var(--about-surface-shadow);
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
  width: 100%;
  min-height: 7.75rem;
  box-sizing: border-box;
}

@media (min-width: 560px) {
  .about-link-pill {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 16px;
  }
}

@media (min-width: 960px) {
  .about-link-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: stretch;
  }

  .about-link-list > li {
    display: flex;
    min-height: 100%;
  }

  .about-link-pill {
    min-height: 100%;
  }
}

.about-link-pill:hover {
  border-color: color-mix(in srgb, var(--accent-green) 45%, var(--border-color));
  background: color-mix(in srgb, var(--accent-green) 5%, var(--about-surface-bg));
  box-shadow: 0 2px 6px color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.about-link-label {
  font-weight: 700;
  font-size: 0.95rem;
  flex-shrink: 0;
}

.about-link-note {
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text-secondary);
  flex: 1 1 auto;
  min-width: 0;
}

.about-section--tech {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

.about-section--tech .about-panel {
  max-width: min(58rem, 100%);
  margin-top: 4px;
}
</style>
