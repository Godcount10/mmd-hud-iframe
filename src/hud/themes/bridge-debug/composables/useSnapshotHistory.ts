import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { ChatSnapshot } from '../../../../contracts'
import type { SnapshotRecord } from '../types'
import { cloneDebugValue } from '../utils/cloneDebugValue'

export const MAX_SNAPSHOTS = 200

export function useSnapshotHistory(snapshot: Readonly<Ref<ChatSnapshot>>) {
  const snapshots = ref<SnapshotRecord[]>([])
  const droppedSnapshots = ref(0)

  const capture = (next: ChatSnapshot) => {
    if (snapshots.value.at(-1)?.revision === next.revision) return
    snapshots.value.push({
      revision: next.revision,
      capturedAt: new Date().toISOString(),
      snapshot: cloneDebugValue(next),
    })
    if (snapshots.value.length > MAX_SNAPSHOTS) {
      const dropped = snapshots.value.length - MAX_SNAPSHOTS
      snapshots.value.splice(0, dropped)
      droppedSnapshots.value += dropped
    }
  }

  capture(snapshot.value)
  const stop = watch(snapshot, capture, { deep: false })
  onUnmounted(stop)

  return {
    snapshots,
    droppedSnapshots,
    latest: computed(() => snapshots.value.at(-1) ?? null),
    clearSnapshots: () => {
      snapshots.value = []
      droppedSnapshots.value = 0
      capture(snapshot.value)
    },
  }
}
