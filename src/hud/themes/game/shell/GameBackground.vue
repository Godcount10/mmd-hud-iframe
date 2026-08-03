<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  imageUrl?: string | null
  imageOpacity?: number
  imagePosition?: string
}>(), {
  imageUrl: null,
  imageOpacity: 1,
  imagePosition: 'center center',
})

const backgroundStyle = computed(() => ({
  '--game-background-image': props.imageUrl ? `url("${props.imageUrl.replace(/["\\\n\r]/g, '')}")` : 'none',
  '--game-background-opacity': String(Math.max(0, Math.min(1, props.imageOpacity))),
  '--game-background-position': props.imagePosition,
}))
</script>

<template>
  <div class="game-background" :style="backgroundStyle" aria-hidden="true">
    <div class="game-background__image" />
    <div class="game-background__tint" />
    <div class="game-background__vignette" />
    <div class="game-background__texture" />
  </div>
</template>
