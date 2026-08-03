import type {
  ActionResult,
  BridgeError,
  BridgeListener,
  CapabilityMap,
  ChatSnapshot,
  GenerationSnapshot,
  NativeAction,
  NativeBridge,
} from '../contracts'
import { invokeRegisteredAction } from './actions/actionRegistry'
import { createEmptyCapabilities } from './actions/capabilities'
import { readInputGenerationStateSignature } from './mmd/generationReader'
import { MMD_SELECTORS } from './mmd/selectors'
import {
  createMessageIdentityResolver,
  readMmdSnapshot,
  type MessageIdentityResolver,
} from './mmd/snapshotReader'

const EMPTY_SNAPSHOT: ChatSnapshot = {
  revision: 0,
  character: { id: null, name: '未连接', avatar: null },
  messages: [],
  generation: { status: 'idle', messageId: null },
  connection: { status: 'connecting', error: null },
  editPanel: { open: false, messageId: null, text: '', transforms: [] },
  sharePanel: { open: false, title: '', subtitle: '', link: '' },
  modelPanel: { open: false, title: '', filters: [], models: [], activeFilterId: null, selectedModelId: null },
  modelConfiguration: { open: false, title: '', modelName: '', energyCost: null, energyLabel: '', controls: [] },
  moreMenu: { open: false, items: [] },
  conversationPanel: { open: false, title: '', conversations: [], currentConversationId: null },
  personaPanel: {
    open: false,
    title: '',
    modes: [],
    currentModeId: null,
    name: '',
    maxLength: 0,
    nameDisabled: false,
    genderChoices: [],
    selectedGenderId: null,
    identity: '',
    identityMaxLength: 0,
    identityDisabled: false,
    restriction: '',
  },
  supplementPanel: {
    open: false,
    title: '',
    text: '',
    maxLength: 0,
    positionId: null,
    positionLabel: '',
    picker: { open: false, choices: [], pendingChoiceId: null },
  },
  instructionSelector: { open: false, empty: true, revision: '', instructions: [] },
  chatSettings: { open: false, title: '', empty: true, controls: [] },
  capabilities: createEmptyCapabilities('正在连接'),
}

export class MmdNativeBridge implements NativeBridge {
  private snapshot: ChatSnapshot = structuredClone(EMPTY_SNAPSHOT)
  private listeners = new Set<BridgeListener>()
  private messageObserver: MutationObserver | null = null
  private documentObserver: MutationObserver | null = null
  private observedList: Element | null = null
  private reconnectTimer = 0
  private renderFrame = 0
  private revision = 0
  private lifecycle = 0
  private actionControllers = new Set<AbortController>()
  private editingMessageId: string | null = null
  private lastInputGenerationState = ''
  private lastStreamingLog = ''
  private readonly resolveMessageIdentity: MessageIdentityResolver
  private started = false
  private destroyed = false

  constructor(private readonly nativeDocument: Document = document) {
    this.resolveMessageIdentity = createMessageIdentityResolver(nativeDocument)
  }

  async start(): Promise<void> {
    if (this.started && !this.destroyed) return
    this.lifecycle += 1
    this.started = true
    this.destroyed = false
    this.lastInputGenerationState = readInputGenerationStateSignature(this.nativeDocument)
    this.probeConnection()
    this.bindDocumentObserver()
    this.refreshNow()
    this.reconnectTimer = window.setInterval(() => this.probeLiveness(), 900)
    this.emit({ type: 'ready', snapshot: this.snapshot })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.started = false
    this.lifecycle += 1
    for (const controller of this.actionControllers) controller.abort()
    this.actionControllers.clear()
    this.messageObserver?.disconnect()
    this.messageObserver = null
    this.documentObserver?.disconnect()
    this.documentObserver = null
    this.observedList = null
    window.clearInterval(this.reconnectTimer)
    this.reconnectTimer = 0
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame)
    this.renderFrame = 0
    this.listeners.clear()
  }

  refresh(): void {
    if (this.destroyed || this.renderFrame) return
    const lifecycle = this.lifecycle
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = 0
      if (this.destroyed || lifecycle !== this.lifecycle) return
      this.refreshNow()
    })
  }

  getSnapshot(): ChatSnapshot {
    return structuredClone(this.snapshot)
  }

  getCapabilities(): CapabilityMap {
    return structuredClone(this.snapshot.capabilities)
  }

  subscribe(listener: BridgeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async invoke<T = unknown>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>> {
    if (this.destroyed) {
      return {
        ok: false,
        action,
        error: { code: 'NOT_AVAILABLE', message: 'MMD Bridge 已销毁' },
      }
    }
    const capability = this.snapshot.capabilities[action]
    if (!capability?.available) {
      return {
        ok: false,
        action,
        error: {
          code: 'NOT_AVAILABLE',
          message: capability?.reason || `“${action}”当前不可用`,
        },
      }
    }

    const lifecycle = this.lifecycle
    const controller = new AbortController()
    this.actionControllers.add(controller)
    let result: ActionResult
    try {
      result = await invokeRegisteredAction(action, payload, {
        document: this.nativeDocument,
        messages: this.snapshot.messages,
        signal: controller.signal,
      })
    } finally {
      this.actionControllers.delete(controller)
    }
    if (this.destroyed || lifecycle !== this.lifecycle || controller.signal.aborted) {
      return {
        ok: false,
        action,
        error: { code: 'NOT_AVAILABLE', message: 'MMD Bridge 已销毁，原生动作已取消' },
      } as ActionResult<T>
    }
    if (result.ok && action === 'openEditMessage') {
      const data = result.data as { messageId?: unknown } | undefined
      this.editingMessageId = data?.messageId ? String(data.messageId) : null
    }
    if (result.ok && (action === 'submitEditMessage' || action === 'cancelEditMessage')) {
      this.editingMessageId = null
    }
    this.refresh()
    return result as ActionResult<T>
  }

  sendMessage(text: string): Promise<ActionResult> {
    return this.invoke('sendMessage', { text })
  }

  private bindDocumentObserver(): void {
    if (this.destroyed || this.documentObserver || !this.nativeDocument.body) return
    this.documentObserver = new MutationObserver(() => this.refresh())
    this.documentObserver.observe(this.nativeDocument.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'readonly', 'aria-disabled'],
    })
  }

  private probeLiveness(): void {
    if (this.destroyed) return
    const inputGenerationState = readInputGenerationStateSignature(this.nativeDocument)
    const inputStateChanged = inputGenerationState !== this.lastInputGenerationState
    this.lastInputGenerationState = inputGenerationState
    this.probeConnection()
    if (inputStateChanged) this.refresh()
  }

  private probeConnection(): void {
    if (this.destroyed) return
    const list = this.nativeDocument.querySelector(MMD_SELECTORS.messageList)
    if (list === this.observedList && list?.isConnected !== false) {
      if (this.snapshot.connection.status === 'disconnected') this.refresh()
      return
    }

    this.messageObserver?.disconnect()
    this.observedList = list
    this.messageObserver = null

    if (list) {
      this.messageObserver = new MutationObserver(() => this.refresh())
      this.messageObserver.observe(list, {
        subtree: true,
        childList: true,
        characterData: true,
      })
    }
    this.refresh()
  }

  private refreshNow(): void {
    if (this.destroyed) return
    try {
      const next = readMmdSnapshot(this.nativeDocument, {
        revision: ++this.revision,
        connectionStatus: this.observedList ? 'connected' : 'connecting',
        resolveMessageIdentity: this.resolveMessageIdentity,
      }, this.editingMessageId)
      if (!next.editPanel.open) this.editingMessageId = null
      const previousComparable = { ...this.snapshot, revision: 0 }
      const nextComparable = { ...next, revision: 0 }
      if (JSON.stringify(previousComparable) === JSON.stringify(nextComparable)) {
        this.revision -= 1
        return
      }
      this.snapshot = next
      this.logGenerationProgress(previousComparable.generation, next)
      this.emit({ type: 'snapshot', snapshot: this.snapshot })
      this.emitGenerationTransition(previousComparable.generation, next.generation)
    } catch (error) {
      const bridgeError: BridgeError = {
        code: 'PLATFORM_CHANGED',
        message: error instanceof Error ? error.message : '读取 MMD 页面失败',
      }
      this.snapshot = {
        ...this.snapshot,
        revision: ++this.revision,
        connection: { status: 'disconnected', error: bridgeError.message },
        capabilities: createEmptyCapabilities('读取 MMD 页面失败，原生功能已禁用'),
      }
      this.emit({ type: 'snapshot', snapshot: this.snapshot })
      this.emit({ type: 'error', error: bridgeError })
    }
  }

  private logGenerationProgress(
    previous: GenerationSnapshot,
    next: ChatSnapshot,
  ): void {
    const generation = next.generation
    if (previous.status === 'idle' && generation.status !== 'idle') {
      console.info('[MMD Bridge][推测] 消息开始', {
        status: generation.status,
        messageId: generation.messageId,
        revision: next.revision,
      })
    }
    if (generation.status === 'streaming' && generation.messageId) {
      const message = next.messages.find((candidate) => candidate.id === generation.messageId)
      const signature = `${generation.messageId}:${message?.text.length ?? 0}`
      if (signature !== this.lastStreamingLog) {
        this.lastStreamingLog = signature
        console.info('[MMD Bridge][推测] 消息输出进行', {
          status: generation.status,
          messageId: generation.messageId,
          textLength: message?.text.length ?? 0,
          revision: next.revision,
        })
      }
    }
    if (previous.status !== 'idle' && generation.status === 'idle') {
      console.info('[MMD Bridge][推测] 消息结束', {
        previousMessageId: previous.messageId,
        revision: next.revision,
      })
      this.lastStreamingLog = ''
    }
  }

  private emitGenerationTransition(
    previous: GenerationSnapshot,
    next: GenerationSnapshot,
  ): void {
    if (previous.status === next.status && previous.messageId === next.messageId) return
    if (previous.status === 'idle' && next.status !== 'idle') {
      this.emit({ type: 'generation-started', snapshot: this.snapshot })
    }
    if (next.status === 'streaming' && next.messageId && (
      previous.status !== 'streaming' || previous.messageId !== next.messageId
    )) {
      this.emit({
        type: 'generation-streaming',
        snapshot: this.snapshot,
        messageId: next.messageId,
      })
    }
    if (previous.status !== 'idle' && next.status === 'idle') {
      this.emit({
        type: 'generation-finished',
        snapshot: this.snapshot,
        messageId: previous.messageId,
      })
    }
  }

  private emit(event: Parameters<BridgeListener>[0]): void {
    for (const listener of this.listeners) {
      try {
        listener(event.type === 'error'
          ? event
          : { ...event, snapshot: structuredClone(event.snapshot) })
      } catch (error) {
        console.error('[MMD Bridge] 订阅者执行失败', error)
      }
    }
  }
}
