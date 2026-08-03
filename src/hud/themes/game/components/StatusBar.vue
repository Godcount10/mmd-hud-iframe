<script setup lang="ts">
// 状态栏组件：同一份 StatBarItem，按 kind 渲染成文字 / 进度条 / 徽标。
// 显示样式在组件层决定，解析逻辑不受影响。
import { computed } from 'vue'
import type { StatBarItem } from '../types'

const props = defineProps<{ items: StatBarItem[] }>()

function barPercent(item: StatBarItem): number {
  if (item.numeric === null) return 0
  // stateBar 已在 displayValue 上做过换算，这里用 numeric 对 100 归一化兜底。
  return Math.max(0, Math.min(100, item.numeric))
}

const hasItems = computed(() => props.items.length > 0)
</script>

<template>
  <section class="status-bar">
    <p v-if="!hasItems" class="status-bar__empty">暂无状态</p>
    <ul v-else class="status-bar__list">
      <li v-for="item in items" :key="item.key" class="status-bar__item">
        <span class="status-bar__key">{{ item.key }}</span>

        <template v-if="item.kind === 'bar'">
          <span class="status-bar__track">
            <span class="status-bar__fill" :style="{ width: barPercent(item) + '%' }" />
          </span>
          <span class="status-bar__value">{{ item.displayValue }}</span>
        </template>

        <span v-else-if="item.kind === 'badge'" class="status-bar__badge">
          {{ item.displayValue }}
        </span>

        <span v-else class="status-bar__value">{{ item.displayValue }}</span>
      </li>
    </ul>
  </section>
</template>
