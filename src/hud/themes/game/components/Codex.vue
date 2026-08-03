<script setup lang="ts">
// 图鉴视图（占位）。「纯本地功能」，从 stores 取状态渲染，不碰 Bridge。
import type { CodexModel } from '../systems/codex'

defineProps<{ model: CodexModel }>()
</script>

<template>
  <section class="codex-view">
    <p class="codex-view__placeholder">图鉴（待实现）</p>
    <!-- TODO: 渲染 model.entries -->
  </section>
</template>
