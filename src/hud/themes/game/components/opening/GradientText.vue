<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
const props = withDefaults(defineProps<{ colors?: string[]; speed?: number }>(), { colors: () => ['#d80e0e', '#ffffff', '#c76c6a'], speed: 8 })
const root = ref<HTMLElement | null>(null)
let frame = 0
let started = 0
onMounted(() => { const tick = (time: number) => { if (!root.value) return; if (!started) started = time; const progress = ((time - started) / (props.speed * 1000)) % 2; const normalized = progress <= 1 ? progress : 2 - progress; root.value.style.setProperty('--gradient-position', `${normalized * 100}%`); frame = requestAnimationFrame(tick) }; frame = requestAnimationFrame(tick) })
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>
<template><span ref="root" class="opening-gradient-text"><span class="opening-gradient-text__content"><slot /></span></span></template>
