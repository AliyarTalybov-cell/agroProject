import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api/weather': {
          target: 'https://api.weather.yandex.ru',
          changeOrigin: true,
          headers: {
            'X-Yandex-Weather-Key': env.VITE_YANDEX_WEATHER_KEY || ''
          },
          rewrite: (path) => path.replace(/^\/api\/weather/, '/graphql/query'),
        },
      },
    },
  }
})
