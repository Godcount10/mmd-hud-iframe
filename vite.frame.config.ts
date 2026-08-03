import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { frameCssInjectionPlugin } from './build/frameCssInjection'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __MMD_HUD_BUILD_ID__: JSON.stringify(process.env.MMD_HUD_BUILD_ID ?? 'dev'),
    __MMD_HUD_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [vue(), frameCssInjectionPlugin()],
  build: {
    outDir: 'dist/frame',
    emptyOutDir: true,
    lib: {
      entry: 'src/frame/main.ts',
      formats: ['iife'],
      name: 'MmdHudIframeFrame',
      fileName: () => 'mmd-hud-iframe-frame.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
