import { defineConfig } from 'vite'

export default defineConfig({
  root: 'host-dev',
  base: './',
  define: {
    __MMD_HUD_BUILD_ID__: JSON.stringify('dev'),
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
  },
})
