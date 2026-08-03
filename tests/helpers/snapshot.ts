import { createEmptyCapabilities } from '../../src/bridge/actions/capabilities'
import type { ChatSnapshot } from '../../src/contracts'

export function createTestSnapshot(revision = 1): ChatSnapshot {
  return {
    revision,
    character: { id: 'character-1', name: '测试角色', avatar: null },
    messages: [],
    generation: { status: 'idle', messageId: null },
    connection: { status: 'connected', error: null },
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
    capabilities: createEmptyCapabilities('测试不可用'),
  }
}
