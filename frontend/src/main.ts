import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import { useAuth } from './stores/auth'
import './styles/global.css'

// Применить сохранённую тему до рендера
const saved = localStorage.getItem('agro:theme')
const theme = saved === 'light' || saved === 'dark' ? saved : 'dark'
document.documentElement.setAttribute('data-theme', theme)
document.documentElement.style.colorScheme = theme

const auth = useAuth()
auth.init().then(() => {
  auth.startAuthListener()
  createApp(App).use(router).mount('#app')
})

