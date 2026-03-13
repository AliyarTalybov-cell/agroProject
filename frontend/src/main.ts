import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import './styles/global.css'

// Применить сохранённую тему до рендера
const saved = localStorage.getItem('agro:theme')
const theme = saved === 'light' || saved === 'dark' ? saved : 'dark'
document.documentElement.setAttribute('data-theme', theme)
document.documentElement.style.colorScheme = theme

createApp(App).use(router).mount('#app')

