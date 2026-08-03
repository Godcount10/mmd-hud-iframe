<script setup lang="ts">
import type { NativeAction } from '../../../../contracts'

const props = defineProps<{
  open: boolean
  action: NativeAction
  label: string
  payload?: unknown
  targetRevision: number
  destructive: boolean
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <div v-if="open" class="safety-backdrop" role="presentation" @click.self="emit('cancel')">
    <section class="safety-dialog" role="alertdialog" aria-modal="true" aria-labelledby="safety-title">
      <p class="eyebrow">SAFETY INTERLOCK</p>
      <h2 id="safety-title">确认执行 {{ label }}</h2>
      <p>动作 <code>{{ action }}</code> 将作用于 revision {{ targetRevision }} 的当前原生页面。</p>
      <p v-if="destructive" class="safety-dialog__danger">此操作可能不可撤销。请只在专用测试消息或测试会话上执行。</p>
      <pre>{{ JSON.stringify(payload, null, 2) }}</pre>
      <footer>
        <button type="button" class="lab-button lab-button--quiet" @click="emit('cancel')">取消</button>
        <button type="button" class="lab-button lab-button--danger" @click="emit('confirm')">理解影响，继续</button>
      </footer>
    </section>
  </div>
</template>
