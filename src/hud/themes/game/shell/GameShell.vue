<script setup lang="ts">
import { computed } from 'vue'
import type { StatBarItem } from '../types'
import StatusBar from '../components/StatusBar.vue'

const props = defineProps<{
  characterName: string
  statBar: StatBarItem[]
  refreshDisabled?: boolean
  refreshReason?: string
  refreshing?: boolean
}>()

const emit = defineEmits<{
  codex: []
  map: []
  autoInjection: []
  refresh: []
  menu: []
}>()

const initial = computed(() => props.characterName.trim().slice(0, 1) || 'M')
</script>

<template>
  <div class="game-shell">
    <header class="game-shell__topbar">
      <div class="game-shell__identity">
        <span class="game-shell__avatar" aria-hidden="true">{{ initial }}</span>
        <div>
          <small>MMD // STORY LINK</small>
          <strong>{{ characterName }}</strong>
        </div>
      </div>
      <div class="game-shell__primary-actions" aria-label="常用功能">
        <button type="button" @click="emit('codex')"><span aria-hidden="true">⌑</span><em>图鉴</em></button>
        <button type="button" @click="emit('map')"><span aria-hidden="true">⌖</span><em>地图</em></button>
        <button type="button" @click="emit('autoInjection')"><span aria-hidden="true">↯</span><em>自动注入</em></button>
        <button
          type="button"
          :disabled="refreshDisabled || refreshing"
          :title="refreshDisabled ? refreshReason : '刷新当前角色对话'"
          @click="emit('refresh')"
        ><span aria-hidden="true">↻</span><em>{{ refreshing ? '刷新中' : '刷新' }}</em></button>
        <button type="button" class="game-shell__menu-button" aria-label="打开菜单" @click="emit('menu')">
          <i /><i />
          <em>菜单</em>
        </button>
      </div>
    </header>
    <div class="game-shell__status"><StatusBar :items="statBar" /></div>
    <main class="game-shell__content"><slot /></main>
  </div>
</template>
