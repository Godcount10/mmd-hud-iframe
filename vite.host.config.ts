import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    __MMD_HUD_BUILD_ID__: JSON.stringify(process.env.MMD_HUD_BUILD_ID ?? 'dev'),
  },
  build: {
    outDir: 'dist/host',
    emptyOutDir: true,
    lib: {
      entry: 'src/host/main.ts',
      formats: ['iife'],
      name: 'MmdHudIframeHost',
      fileName: () => 'mmd-hud-iframe-host.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
  },
})
