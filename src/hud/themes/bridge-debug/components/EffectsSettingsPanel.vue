<script setup lang="ts">
import { computed } from 'vue'
import type { EffectSettings } from '../composables/useEffectSettings'
import Hyperspeed from './Hyperspeed.vue'

export type EffectsRuntimeState =
  | 'active'
  | 'ready'
  | 'disabled'
  | 'reduced-motion'
  | 'mobile-blocked'
  | 'page-hidden'
  | 'fallback'

const props = defineProps<{
  settings: EffectSettings
  runtimeState: EffectsRuntimeState
  running: boolean
  fallback: boolean
}>()

const emit = defineEmits<{
  reset: []
  retry: []
  error: []
  'update:settings': [settings: EffectSettings]
}>()

const statusCopy = computed(() => ({
  active: ['引擎运行中', '跃迁观察窗正在消息流界面渲染。'],
  ready: ['引擎待命', '参数已锁定，返回消息流后按最终配置启动。'],
  disabled: ['引擎已关闭', '启用视觉引擎后，消息流会重新挂载观察窗。'],
  'reduced-motion': ['遵循系统静态模式', '系统要求减少动态效果，观察窗将使用静态速度线。'],
  'mobile-blocked': ['移动端策略已阻止', '调整移动端策略或降低强度与密度后可重新启用。'],
  'page-hidden': ['页面不可见', '返回页面后引擎会根据当前参数恢复。'],
  fallback: ['WebGL 已降级', '当前使用静态速度线；可在调整参数后手动重试引擎。'],
}[props.runtimeState]))

const statusCode = computed(() => props.runtimeState.replace('-', '_').toUpperCase())

const hyperspeedOptions = computed(() => {
  const density = props.settings.density === 'low' ? 18 : props.settings.density === 'high' ? 56 : 36
  const sticks = props.settings.density === 'low' ? 10 : props.settings.density === 'high' ? 26 : 18
  const speed = props.settings.intensity === 'eco' ? 1.2 : props.settings.intensity === 'hyper' ? 3.2 : 2
  const palettes: Record<EffectSettings['palette'], { leftCars: number[]; rightCars: number[]; sticks: number; shoulderLines: number; brokenLines: number }> = {
    gc: { leftCars: [0xff3f8e, 0xff72b4, 0xa78bfa], rightCars: [0x65e9ff, 0x7dc8ff, 0xeafcff], sticks: 0x65e9ff, shoulderLines: 0xffb4d6, brokenLines: 0x65e9ff },
    'red-blue': { leftCars: [0xff234f, 0xff718b], rightCars: [0x177dff, 0x73b6ff], sticks: 0x177dff, shoulderLines: 0xff234f, brokenLines: 0x73b6ff },
    mono: { leftCars: [0xf0e9f7, 0xb8acbf], rightCars: [0xffffff, 0xd0c9d5], sticks: 0xffffff, shoulderLines: 0xffffff, brokenLines: 0xb8acbf },
  }
  return {
    distortion: props.settings.distortion === 'long-race' ? 'LongRaceDistortion' : props.settings.distortion === 'mountain' ? 'mountainDistortion' : 'turbulentDistortion',
    speedUp: speed,
    fovSpeedUp: props.settings.intensity === 'hyper' ? 170 : props.settings.intensity === 'eco' ? 120 : 150,
    lightPairsPerRoadWay: density,
    totalSideLightSticks: sticks,
    colors: palettes[props.settings.palette],
  }
})

function update<K extends keyof EffectSettings>(key: K, value: EffectSettings[K]): void {
  emit('update:settings', { ...props.settings, [key]: value })
}
</script>

<template>
  <section class="effects-surface" role="tabpanel" aria-labelledby="surface-tab-effects">
    <div :class="['effects-preview', { 'effects-preview--fallback': fallback || !running }]" aria-label="跃迁特效实时预览">
      <Hyperspeed
        v-if="running && !fallback"
        :effect-options="hyperspeedOptions"
        :max-dpr="1.5"
        :hold-to-boost="settings.holdToBoost"
        @error="emit('error')"
      />
      <div class="effects-preview__hud" aria-hidden="true">
        <span>GC TRANSIT // {{ running && !fallback ? 'LIVE' : 'STATIC' }}</span>
        <span>{{ statusCode }}</span>
      </div>
    </div>

    <div class="effects-console">
      <aside class="effects-console__status">
        <div class="effects-orbit" aria-hidden="true">
          <i /><i /><i />
          <span>GC</span>
        </div>
        <div>
          <span class="micro-label">VISUAL ENGINE // {{ statusCode }}</span>
          <h2 id="effects-title" tabindex="-1">跃迁特效舱</h2>
          <strong>{{ statusCopy[0] }}</strong>
          <p role="status" aria-live="polite">{{ statusCopy[1] }}</p>
        </div>
        <dl class="effects-telemetry">
          <div><dt>DISTORTION</dt><dd>{{ settings.distortion }}</dd></div>
          <div><dt>INTENSITY</dt><dd>{{ settings.intensity }}</dd></div>
          <div><dt>DENSITY</dt><dd>{{ settings.density }}</dd></div>
          <div><dt>PALETTE</dt><dd>{{ settings.palette }}</dd></div>
        </dl>
        <button v-if="runtimeState === 'fallback'" type="button" class="lab-button lab-button--quiet effects-retry" @click="emit('retry')">重试视觉引擎</button>
      </aside>

      <div class="effects-console__controls">
        <header>
          <div>
            <span class="micro-label">PARAMETER MATRIX</span>
            <h3>引擎参数校准</h3>
          </div>
          <button type="button" class="lab-button lab-button--quiet" @click="emit('reset')">恢复默认</button>
        </header>

        <div class="effects-control-grid">
          <label class="effects-toggle effects-toggle--primary">
            <span><strong>启用视觉引擎</strong><small>在安全沙箱允许时保存到本地；否则仅本次会话有效</small></span>
            <input type="checkbox" :checked="settings.enabled" @change="update('enabled', ($event.target as HTMLInputElement).checked)" />
          </label>

          <label class="effects-field">
            <span><strong>扭曲模式</strong><small>改变道路与速度场的空间形态</small></span>
            <select :value="settings.distortion" @change="update('distortion', ($event.target as HTMLSelectElement).value as EffectSettings['distortion'])">
              <option value="turbulent">湍流</option><option value="long-race">长赛道</option><option value="mountain">山脉</option>
            </select>
          </label>
          <label class="effects-field">
            <span><strong>引擎强度</strong><small>控制速度、视场和视觉负载</small></span>
            <select :value="settings.intensity" @change="update('intensity', ($event.target as HTMLSelectElement).value as EffectSettings['intensity'])">
              <option value="eco">节能</option><option value="standard">标准</option><option value="hyper">超速</option>
            </select>
          </label>
          <label class="effects-field">
            <span><strong>车流密度</strong><small>控制光轨与道路灯带数量</small></span>
            <select :value="settings.density" @change="update('density', ($event.target as HTMLSelectElement).value as EffectSettings['density'])">
              <option value="low">低</option><option value="medium">中</option><option value="high">高</option>
            </select>
          </label>
          <label class="effects-field">
            <span><strong>信号配色</strong><small>切换左右车流和道路信号色</small></span>
            <select :value="settings.palette" @change="update('palette', ($event.target as HTMLSelectElement).value as EffectSettings['palette'])">
              <option value="gc">GC 樱粉冰蓝</option><option value="red-blue">红蓝</option><option value="mono">单色</option>
            </select>
          </label>
          <label class="effects-toggle">
            <span><strong>按住加速</strong><small>鼠标或触控按住观察窗时提升速度</small></span>
            <input type="checkbox" :checked="settings.holdToBoost" @change="update('holdToBoost', ($event.target as HTMLInputElement).checked)" />
          </label>
          <label class="effects-field">
            <span><strong>移动端策略</strong><small>自动模式会避开高负载组合</small></span>
            <select :value="settings.mobile" @change="update('mobile', ($event.target as HTMLSelectElement).value as EffectSettings['mobile'])">
              <option value="auto">自动</option><option value="on">强制开启</option><option value="off">关闭</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  </section>
</template>
