<script setup lang="ts">
// 地图视图（占位）。「纯本地功能」，从 stores 取状态渲染，不碰 Bridge。
import type { MapModel } from '../systems/map'

defineProps<{ model: MapModel }>()
</script>

<template>
  <section class="map-view">
    <p class="map-view__placeholder">地图（待实现）</p>
    <!-- TODO: 渲染 model.nodes / 当前节点 -->
  </section>
</template>
