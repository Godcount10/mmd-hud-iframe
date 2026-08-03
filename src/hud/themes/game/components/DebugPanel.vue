<script setup lang="ts">
// 调试二级界面：可视化文本处理层的配置、解析成败、消息源。
// 默认隐藏，由 GameHud 的“调试”按钮弹出。仅调试用，不影响玩家体验。
import { computed } from 'vue'
import type { ParseDiagnostics } from '../systems/parseMessage'
import type { StatDisplayConfig } from '../systems/stateBar'

const props = defineProps<{
  /** 当前生效的正则字符串。 */
  pattern: string
  /** 解析读取的文本来源：纯文本还是 HTML。 */
  source: 'text' | 'html'
  /** 状态栏显示规则配置。 */
  displayConfig: StatDisplayConfig
  /** 本次解析诊断。 */
  diagnostics: ParseDiagnostics
}>()

const emit = defineEmits<{ close: [] }>()

// 解析层是否“工作正常”：读到了消息，且（在有标记时）成功解析。
const loadStatus = computed(() => {
  const d = props.diagnostics
  if (d.totalMessages === 0) return { ok: false, label: '未读到任何消息（数据源可能未连接）' }
  if (d.totalMatches === 0) return { ok: true, label: `已扫描 ${d.totalMessages} 条消息，未发现 [A=B] 标记` }
  return { ok: true, label: `已解析 ${d.totalMatches} 个标记，最终生效 ${d.result.stats.length} 项` }
})

const displayRules = computed(() =>
  Object.entries(props.displayConfig).map(([key, rule]) => ({
    key,
    text: `${rule.kind}${rule.max != null ? ` / max ${rule.max}` : ''}${rule.suffix ? ` / 后缀 "${rule.suffix}"` : ''}`,
  })),
)
</script>

<template>
  <div class="debug-panel">
    <header class="debug-panel__head">
      <span class="debug-panel__title">文本处理层调试</span>
      <button type="button" class="debug-panel__close" @click="emit('close')">关闭</button>
    </header>

    <!-- 1. 解析层配置 -->
    <section class="debug-block">
      <h3 class="debug-block__title">解析层配置</h3>
      <dl class="debug-kv">
        <dt>正则</dt>
        <dd><code>{{ pattern }}</code></dd>
        <dt>文本来源</dt>
        <dd>{{ source === 'text' ? 'message.text（纯文本）' : 'message.html（HTML）' }}</dd>
        <dt>显示规则</dt>
        <dd>
          <span v-if="displayRules.length === 0" class="debug-muted">全部走默认（text）</span>
          <ul v-else class="debug-list">
            <li v-for="rule in displayRules" :key="rule.key">
              <b>{{ rule.key }}</b>：{{ rule.text }}
            </li>
          </ul>
        </dd>
      </dl>
    </section>

    <!-- 2. 加载/解析成败状态 -->
    <section class="debug-block">
      <h3 class="debug-block__title">加载状态</h3>
      <p class="debug-status" :class="loadStatus.ok ? 'debug-status--ok' : 'debug-status--fail'">
        <span class="debug-status__dot" />
        {{ loadStatus.ok ? '成功' : '异常' }} — {{ loadStatus.label }}
      </p>
      <ul class="debug-list debug-list--stats" v-if="diagnostics.result.stats.length">
        <li v-for="stat in diagnostics.result.stats" :key="stat.key">
          <b>{{ stat.key }}</b> = {{ stat.value }}
        </li>
      </ul>
    </section>

    <!-- 3. 消息源概览 -->
    <section class="debug-block">
      <h3 class="debug-block__title">
        消息源概览（{{ diagnostics.messagesWithMatch }}/{{ diagnostics.totalMessages }} 命中）
      </h3>
      <p v-if="diagnostics.totalMessages === 0" class="debug-muted">无消息</p>
      <ol v-else class="debug-msglist">
        <li v-for="msg in diagnostics.perMessage" :key="msg.messageId" class="debug-msg">
          <span class="debug-msg__role" :data-role="msg.role">{{ msg.role }}</span>
          <span class="debug-msg__preview">{{ msg.textPreview || '（空）' }}</span>
          <span
            class="debug-msg__badge"
            :class="msg.matched > 0 ? 'debug-msg__badge--hit' : 'debug-msg__badge--miss'"
          >
            {{ msg.matched > 0 ? `命中 ${msg.matched}：${msg.keys.join(', ')}` : '无标记' }}
          </span>
        </li>
      </ol>
    </section>
  </div>
</template>
