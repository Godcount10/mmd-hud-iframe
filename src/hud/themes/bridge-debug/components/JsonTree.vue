<script setup lang="ts">
defineProps<{ value: unknown; empty?: string }>()
</script>

<template>
  <pre class="json-tree">{{ value == null ? (empty ?? '暂无数据') : JSON.stringify(value, null, 2) }}</pre>
</template>
