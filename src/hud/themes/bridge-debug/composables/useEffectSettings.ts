import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export const EFFECT_SETTINGS_KEY = 'CUSTOM_GC_DEBUG_EFFECTS_V1'

export type DistortionMode = 'turbulent' | 'long-race' | 'mountain'
export type EffectIntensity = 'eco' | 'standard' | 'hyper'
export type TrafficDensity = 'low' | 'medium' | 'high'
export type EffectPalette = 'gc' | 'red-blue' | 'mono'
export type MobileEffectMode = 'auto' | 'on' | 'off'

export interface EffectSettings {
  enabled: boolean
  distortion: DistortionMode
  intensity: EffectIntensity
  density: TrafficDensity
  palette: EffectPalette
  holdToBoost: boolean
  mobile: MobileEffectMode
}

export const DEFAULT_EFFECT_SETTINGS: Readonly<EffectSettings> = Object.freeze({
  enabled: true,
  distortion: 'turbulent',
  intensity: 'standard',
  density: 'medium',
  palette: 'gc',
  holdToBoost: true,
  mobile: 'auto',
})

const distortionModes: DistortionMode[] = ['turbulent', 'long-race', 'mountain']
const intensities: EffectIntensity[] = ['eco', 'standard', 'hyper']
const densities: TrafficDensity[] = ['low', 'medium', 'high']
const palettes: EffectPalette[] = ['gc', 'red-blue', 'mono']
const mobileModes: MobileEffectMode[] = ['auto', 'on', 'off']

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

export function normalizeEffectSettings(value: unknown): EffectSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_EFFECT_SETTINGS }
  const candidate = value as Partial<Record<keyof EffectSettings, unknown>>
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_EFFECT_SETTINGS.enabled,
    distortion: isOneOf(candidate.distortion, distortionModes) ? candidate.distortion : DEFAULT_EFFECT_SETTINGS.distortion,
    intensity: isOneOf(candidate.intensity, intensities) ? candidate.intensity : DEFAULT_EFFECT_SETTINGS.intensity,
    density: isOneOf(candidate.density, densities) ? candidate.density : DEFAULT_EFFECT_SETTINGS.density,
    palette: isOneOf(candidate.palette, palettes) ? candidate.palette : DEFAULT_EFFECT_SETTINGS.palette,
    holdToBoost: typeof candidate.holdToBoost === 'boolean' ? candidate.holdToBoost : DEFAULT_EFFECT_SETTINGS.holdToBoost,
    mobile: isOneOf(candidate.mobile, mobileModes) ? candidate.mobile : DEFAULT_EFFECT_SETTINGS.mobile,
  }
}

export function resolveBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readEffectSettings(storage?: Pick<Storage, 'getItem'> | null): EffectSettings {
  const target = storage === undefined ? resolveBrowserStorage() : storage
  if (!target) return { ...DEFAULT_EFFECT_SETTINGS }
  try {
    const raw = target.getItem(EFFECT_SETTINGS_KEY)
    return raw ? normalizeEffectSettings(JSON.parse(raw)) : { ...DEFAULT_EFFECT_SETTINGS }
  } catch {
    return { ...DEFAULT_EFFECT_SETTINGS }
  }
}

export function writeEffectSettings(settings: EffectSettings, storage?: Pick<Storage, 'setItem'> | null): boolean {
  const target = storage === undefined ? resolveBrowserStorage() : storage
  if (!target) return false
  try {
    target.setItem(EFFECT_SETTINGS_KEY, JSON.stringify(normalizeEffectSettings(settings)))
    return true
  } catch {
    return false
  }
}

export function effectCanRun(settings: EffectSettings, reducedMotion: boolean, mobile: boolean, pageVisible: boolean): boolean {
  if (!settings.enabled || reducedMotion || !pageVisible) return false
  if (!mobile) return true
  if (settings.mobile === 'off') return false
  if (settings.mobile === 'on') return true
  return settings.intensity !== 'hyper' && settings.density !== 'high'
}

export function useEffectSettings() {
  const settings = ref<EffectSettings>(readEffectSettings())
  const reducedMotion = ref(false)
  const mobile = ref(false)
  const pageVisible = ref(typeof document === 'undefined' || document.visibilityState !== 'hidden')
  let reducedQuery: MediaQueryList | null = null
  let mobileQuery: MediaQueryList | null = null

  const syncMedia = () => {
    reducedMotion.value = reducedQuery?.matches ?? false
    mobile.value = mobileQuery?.matches ?? false
  }
  const syncVisibility = () => { pageVisible.value = document.visibilityState !== 'hidden' }

  onMounted(() => {
    reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    mobileQuery = window.matchMedia('(max-width: 760px), (pointer: coarse)')
    syncMedia()
    syncVisibility()
    reducedQuery.addEventListener('change', syncMedia)
    mobileQuery.addEventListener('change', syncMedia)
    document.addEventListener('visibilitychange', syncVisibility)
  })

  onBeforeUnmount(() => {
    reducedQuery?.removeEventListener('change', syncMedia)
    mobileQuery?.removeEventListener('change', syncMedia)
    document.removeEventListener('visibilitychange', syncVisibility)
  })

  watch(settings, value => { writeEffectSettings(value) }, { deep: true })

  return {
    settings,
    reducedMotion,
    mobile,
    pageVisible,
    canRun: computed(() => effectCanRun(settings.value, reducedMotion.value, mobile.value, pageVisible.value)),
    reset: () => { settings.value = { ...DEFAULT_EFFECT_SETTINGS } },
  }
}
