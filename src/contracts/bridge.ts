export type MessageRole = 'user' | 'assistant' | 'system' | 'unknown'

export type GenerationStatus =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'stopping'
  | 'error'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface CharacterSnapshot {
  id: string | null
  name: string
  avatar: string | null
  author?: string | null
}

export interface MessageCapabilities {
  copy: boolean
  edit: boolean
  delete: boolean
  regenerate: boolean
  rollback: boolean
  startNewStory: boolean
  previousBranch: boolean
  nextBranch: boolean
}

export interface DeleteMessagePayload {
  messageId: string
  confirmationToken?: string
}

export interface DeleteMessageConfirmation {
  messageId: string
  confirmationToken: string
  prompt: string
  nativeConfirmation: 'handled-if-present'
}

export type DeleteMessageResult =
  | {
    phase: 'confirmation-required'
    messageId: string
    confirmation: DeleteMessageConfirmation
  }
  | {
    phase: 'deleted'
    messageId: string
    nativeConfirmationHandled: boolean
  }

export interface ChatMessage {
  id: string
  role: MessageRole
  index: number
  text: string
  html: string
  streaming: boolean
  capabilities: MessageCapabilities
  /** Stable role/content identity used to validate a live native target. */
  targetFingerprint?: string
  /** Position in the unfiltered native message list when it was snapshotted. */
  nativeIndex?: number
}

export interface GenerationSnapshot {
  status: GenerationStatus
  messageId: string | null
}

export interface ConnectionSnapshot {
  status: ConnectionStatus
  error: string | null
}

export interface EditTransformOption {
  id: string
  label: string
}

export interface EditPanelSnapshot {
  open: boolean
  messageId: string | null
  text: string
  transforms: EditTransformOption[]
}

export interface SharePanelSnapshot {
  open: boolean
  title: string
  subtitle: string
  link: string
}

export interface ModelFilterSnapshot {
  id: string
  label: string
  active: boolean
}

export interface ModelOptionSnapshot {
  id: string
  name: string
  description: string
  batteryCost: number | null
  batteryLabel: string
  permission: string
  successRate: string
  selected: boolean
}

export interface ModelPanelSnapshot {
  open: boolean
  title: string
  filters: ModelFilterSnapshot[]
  models: ModelOptionSnapshot[]
  activeFilterId: string | null
  selectedModelId: string | null
}

export interface ModelSettingChoiceSnapshot {
  id: string
  label: string
  selected: boolean
}

export interface ModelSettingControlSnapshot {
  id: string
  type: 'choice' | 'toggle'
  label: string
  description: string
  value: string | boolean | null
  choices: ModelSettingChoiceSnapshot[]
}

export interface ModelConfigurationSnapshot {
  open: boolean
  title: string
  modelName: string
  energyCost: number | null
  energyLabel: string
  controls: ModelSettingControlSnapshot[]
}

export interface ConversationReferenceSnapshot {
  id: string
  fingerprint: string
  index: number
}

export interface ConversationReferencePayload {
  conversationId: string
  fingerprint: string
  index: number
}

export interface DeleteConversationPayload extends ConversationReferencePayload {
  confirmationToken?: string
}

export interface DeleteConversationConfirmation extends ConversationReferencePayload {
  confirmationToken: string
  prompt: string
}

export type DeleteConversationResult =
  | {
    phase: 'confirmation-required'
    conversationId: string
    confirmation: DeleteConversationConfirmation
  }
  | {
    phase: 'deleted'
    conversationId: string
  }

export interface ConversationOptionCapabilities {
  rename: boolean
  delete: boolean
}

export interface ConversationOptionSnapshot extends ConversationReferenceSnapshot {
  title: string
  preview: string
  avatar: string | null
  current: boolean
  capabilities: ConversationOptionCapabilities
}

export interface ConversationPanelSnapshot {
  open: boolean
  title: string
  conversations: ConversationOptionSnapshot[]
  currentConversationId: string | null
}

export type MoreMenuItemKind =
  | 'resetChat'
  | 'exportChat'
  | 'newChat'
  | 'editRole'
  | 'background'
  | 'customInstructions'
  | 'persona'
  | 'supplement'
  | 'chatSettings'
  | 'tutorial'
  | 'unknown'

export interface MoreMenuItemSnapshot {
  id: string
  label: string
  icon: string
  kind: MoreMenuItemKind
  available: boolean
  destructive: boolean
}

export interface MoreMenuSnapshot {
  open: boolean
  items: MoreMenuItemSnapshot[]
}

export interface PersonaModeSnapshot {
  id: string
  label: string
  selected: boolean
  disabled: boolean
}

export interface PersonaGenderChoiceSnapshot {
  id: string
  label: string
  selected: boolean
  disabled: boolean
}

export interface PersonaPanelSnapshot {
  open: boolean
  title: string
  modes: PersonaModeSnapshot[]
  currentModeId: string | null
  name: string
  maxLength: number
  nameDisabled: boolean
  genderChoices: PersonaGenderChoiceSnapshot[]
  selectedGenderId: string | null
  identity: string
  identityMaxLength: number
  identityDisabled: boolean
  restriction: string
}

export interface SupplementPositionChoiceSnapshot {
  id: string
  label: string
  selected: boolean
}

export interface SupplementPositionPickerSnapshot {
  open: boolean
  choices: SupplementPositionChoiceSnapshot[]
  pendingChoiceId: string | null
}

export interface SupplementPanelSnapshot {
  open: boolean
  title: string
  text: string
  maxLength: number
  positionId: string | null
  positionLabel: string
  picker: SupplementPositionPickerSnapshot
}

export interface InstructionOptionSnapshot {
  id: string
  label: string
  fingerprint: string
  index: number
}

export interface InstructionSelectorSnapshot {
  open: boolean
  empty: boolean
  revision: string
  instructions: InstructionOptionSnapshot[]
}

export interface ChatSettingOptionSnapshot {
  id: string
  label: string
  selected: boolean
}

export interface ChatSettingControlSnapshot {
  id: string
  label: string
  description: string
  options: ChatSettingOptionSnapshot[]
  selectedOptionId: string | null
  collapsed: boolean
}

export interface ChatSettingsSnapshot {
  open: boolean
  title: string
  empty: boolean
  controls: ChatSettingControlSnapshot[]
}

export interface ChatSnapshot {
  revision: number
  character: CharacterSnapshot
  messages: ChatMessage[]
  generation: GenerationSnapshot
  connection: ConnectionSnapshot
  editPanel: EditPanelSnapshot
  sharePanel: SharePanelSnapshot
  modelPanel: ModelPanelSnapshot
  modelConfiguration: ModelConfigurationSnapshot
  moreMenu: MoreMenuSnapshot
  conversationPanel: ConversationPanelSnapshot
  personaPanel: PersonaPanelSnapshot
  supplementPanel: SupplementPanelSnapshot
  instructionSelector: InstructionSelectorSnapshot
  chatSettings: ChatSettingsSnapshot
  capabilities: CapabilityMap
}

export const ALL_NATIVE_ACTIONS = [
  'sendMessage',
  'setInputText',
  'exit',
  'copyMessage',
  'stopGeneration',
  'continueGeneration',
  'regenerateMessage',
  'openEditMessage',
  'setEditText',
  'applyEditTransform',
  'submitEditMessage',
  'cancelEditMessage',
  'rollbackMessage',
  'startNewStoryFromMessage',
  'openComments',
  'openSharePanel',
  'copyShareLink',
  'closeSharePanel',
  'toggleFavorite',
  'refreshConversation',
  'deleteMessage',
  'editMessage',
  'previousBranch',
  'nextBranch',
  'newChat',
  'openModelSettings',
  'closeModelSettings',
  'selectModelFilter',
  'selectModel',
  'openModelConfiguration',
  'setModelSetting',
  'submitModelConfiguration',
  'closeModelConfiguration',
  'openChatSettings',
  'closeChatSettings',
  'submitChatSettings',
  'openMoreMenu',
  'closeMoreMenu',
  'activateMoreMenuItem',
  'openTutorial',
  'openBackgroundPanel',
  'openCustomInstructions',
  'openConversationPanel',
  'selectConversation',
  'renameConversation',
  'requestDeleteConversation',
  'deleteConversation',
  'createConversation',
  'closeConversationPanel',
  'openPersona',
  'setPersonaMode',
  'setPersonaName',
  'setPersonaGender',
  'setPersonaIdentity',
  'submitPersona',
  'closePersona',
  'openSupplement',
  'setSupplementText',
  'openSupplementPositionPicker',
  'setSupplementPosition',
  'confirmSupplementPosition',
  'cancelSupplementPosition',
  'submitSupplement',
  'closeSupplement',
  'openPromptSelector',
  'closePromptSelector',
  'applyInstruction',
] as const

export type NativeAction = typeof ALL_NATIVE_ACTIONS[number]

export interface InstructionReferencePayload {
  instructionId: string
  revision: string
  fingerprint: string
  label: string
  index: number
}

export interface NativeActionPayloadMap {
  sendMessage: { text: string }
  setInputText: { text: string }
  exit: undefined
  copyMessage: { messageId: string }
  stopGeneration: never
  continueGeneration: never
  regenerateMessage: { messageId: string }
  openEditMessage: { messageId: string }
  setEditText: { text: string }
  applyEditTransform: { transformId: string }
  submitEditMessage: { messageId: string; text: string }
  cancelEditMessage: undefined
  rollbackMessage: { messageId: string }
  startNewStoryFromMessage: { messageId: string }
  openComments: undefined
  openSharePanel: undefined
  copyShareLink: undefined
  closeSharePanel: undefined
  toggleFavorite: undefined
  refreshConversation: undefined
  deleteMessage: DeleteMessagePayload
  editMessage: never
  previousBranch: never
  nextBranch: never
  newChat: never
  openModelSettings: undefined
  closeModelSettings: undefined
  selectModelFilter: { filterId: string }
  selectModel: { modelId: string }
  openModelConfiguration: { modelId: string }
  setModelSetting: { controlId: string; choiceId?: string }
  submitModelConfiguration: undefined
  closeModelConfiguration: undefined
  openChatSettings: undefined
  closeChatSettings: undefined
  submitChatSettings: undefined
  openMoreMenu: undefined
  closeMoreMenu: undefined
  activateMoreMenuItem: { itemId: string }
  openTutorial: undefined
  openBackgroundPanel: undefined
  openCustomInstructions: undefined
  openConversationPanel: undefined
  selectConversation: ConversationReferencePayload
  renameConversation: ConversationReferencePayload & { title: string }
  requestDeleteConversation: ConversationReferencePayload
  deleteConversation: DeleteConversationPayload
  createConversation: undefined
  closeConversationPanel: undefined
  openPersona: undefined
  setPersonaMode: { modeId: string }
  setPersonaName: { name: string }
  setPersonaGender: { genderId: string }
  setPersonaIdentity: { identity: string }
  submitPersona: { name: string; identity: string }
  closePersona: undefined
  openSupplement: undefined
  setSupplementText: { text: string }
  openSupplementPositionPicker: undefined
  setSupplementPosition: { choiceId: string }
  confirmSupplementPosition: undefined
  cancelSupplementPosition: undefined
  submitSupplement: { text: string }
  closeSupplement: undefined
  openPromptSelector: undefined
  closePromptSelector: undefined
  applyInstruction: InstructionReferencePayload
}

export type NativeActionPayload<A extends NativeAction> = NativeActionPayloadMap[A]

export interface Capability {
  available: boolean
  reason?: string
}

export type CapabilityMap = Record<NativeAction, Capability>

export type BridgeErrorCode =
  | 'NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'INVALID_ARGUMENT'
  | 'TIMEOUT'
  | 'PLATFORM_CHANGED'
  | 'UNKNOWN'

export interface BridgeError {
  code: BridgeErrorCode
  message: string
}

export interface ActionResult<T = unknown> {
  ok: boolean
  action: NativeAction
  data?: T
  error?: BridgeError
}

export type BridgeEvent =
  | { type: 'ready'; snapshot: ChatSnapshot }
  | { type: 'snapshot'; snapshot: ChatSnapshot }
  | { type: 'generation-started'; snapshot: ChatSnapshot }
  | { type: 'generation-streaming'; snapshot: ChatSnapshot; messageId: string }
  | { type: 'generation-finished'; snapshot: ChatSnapshot; messageId: string | null }
  | { type: 'error'; error: BridgeError }

export type BridgeListener = (event: BridgeEvent) => void

export interface NativeBridge {
  start(): Promise<void>
  destroy(): void
  refresh(): void
  getSnapshot(): ChatSnapshot
  getCapabilities(): CapabilityMap
  subscribe(listener: BridgeListener): () => void
  invoke<T = unknown>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>>
  sendMessage(text: string): Promise<ActionResult>
  /**
   * Actions this bridge has a real handler for. Reported to the Frame in the
   * handshake so debug tooling can tell "contract only" from "not available
   * right now". Omit to fall back to the built-in DOM adapter's registry.
   */
  getRegisteredActions?(): readonly NativeAction[]
}
