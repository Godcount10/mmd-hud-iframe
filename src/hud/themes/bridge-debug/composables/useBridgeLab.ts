import { onUnmounted, ref } from 'vue'
import type { BridgeEvent } from '../../../../contracts'
import { useHudContext } from '../../../context'
import type { BridgeEventRecord } from '../types'
import { cloneDebugValue } from '../utils/cloneDebugValue'

export const MAX_TIMELINE = 1_000

export function useBridgeLab() {
  const context = useHudContext()
  const events = ref<BridgeEventRecord[]>([])
  const droppedEvents = ref(0)
  let eventId = 0

  const appendEvent = (event: BridgeEvent) => {
    const snapshot = 'snapshot' in event ? event.snapshot : null
    events.value.push({
      id: ++eventId,
      receivedAt: new Date().toISOString(),
      revision: snapshot?.revision ?? null,
      event: cloneDebugValue(event),
    })
    if (events.value.length > MAX_TIMELINE) {
      const dropped = events.value.length - MAX_TIMELINE
      events.value.splice(0, dropped)
      droppedEvents.value += dropped
    }
  }

  const unsubscribe = context.subscribe(appendEvent)
  onUnmounted(unsubscribe)

  return {
    context,
    events,
    droppedEvents,
    clearEvents: () => {
      events.value = []
      droppedEvents.value = 0
    },
  }
}
