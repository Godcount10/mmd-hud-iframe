<script setup lang="ts">
import { useHudContext } from '../../../../context'

const emit = defineEmits<{
  back: []
  openPersona: []
  openSupplement: []
}>()

const { snapshot } = useHudContext()
</script>

<template>
  <section class="settings-page">
    <header class="settings-page__head">
      <button type="button" @click="emit('back')">← 返回对话</button>
      <div><span>GAME &amp; NATIVE SYSTEM</span><h1>设置</h1></div>
    </header>
    <div class="settings-page__grid">
      <button
        type="button"
        class="settings-page__card settings-page__card--native"
        :disabled="!snapshot.capabilities.openPersona.available"
        :title="snapshot.capabilities.openPersona.reason"
        @click="emit('openPersona')"
      >
        <small>NATIVE // PERSONA</small>
        <h2>用户人设</h2>
        <p>设置原生称呼、人设模式、性别以及“我是谁”。字段权限以当前 MMD 面板为准。</p>
        <span class="settings-page__status">打开原生镜像 ↗</span>
      </button>
      <button
        type="button"
        class="settings-page__card settings-page__card--native"
        :disabled="!snapshot.capabilities.openSupplement.available"
        :title="snapshot.capabilities.openSupplement.reason"
        @click="emit('openSupplement')"
      >
        <small>NATIVE // SUPPLEMENT</small>
        <h2>补充设定</h2>
        <p>编辑角色补充内容，并选择 system、user、assistant 或角色人设前后的注入位置。</p>
        <span class="settings-page__status">打开原生镜像 ↗</span>
      </button>
      <article class="settings-page__card">
        <small>VISUAL</small>
        <h2>主题背景</h2>
        <p>背景层已经使用可变图片接口。后续可加入本地图片选择、裁切、定位、透明度与遮罩强度。</p>
        <span class="settings-page__status">架构已预留</span>
      </article>
      <article class="settings-page__card">
        <small>MOTION</small>
        <h2>动效强度</h2>
        <p>后续可提供完整、精简与跟随系统三种模式；当前会遵循系统 reduced-motion 设置。</p>
        <span class="settings-page__status">待开发</span>
      </article>
      <article class="settings-page__card">
        <small>AUDIO</small>
        <h2>界面音效</h2>
        <p>菜单、消息、言灵和警告音效将在统一音频系统建立后接入。</p>
        <span class="settings-page__status">待开发</span>
      </article>
      <article class="settings-page__card">
        <small>SAVE</small>
        <h2>本地游戏状态</h2>
        <p>只管理图鉴、地图和界面偏好等本地状态；MMD 聊天存档请使用菜单中的“管理存档”。</p>
        <span class="settings-page__status">待开发</span>
      </article>
    </div>
  </section>
</template>
