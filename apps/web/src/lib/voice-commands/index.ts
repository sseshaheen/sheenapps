/**
 * Voice Commands Module
 *
 * Arabic voice command system for Easy Mode.
 * Provides command matching, normalization, and execution.
 */

export {
  VOICE_COMMANDS,
  type VoiceAction,
  type VoiceCommandDefinition,
  getPhrasesForAction,
  getAllActions,
  getCommandsByCategory
} from './command-definitions'

export {
  normalizeArabic,
  matchCommand,
  mightBeCommand,
  getSuggestedCommands,
  type CommandMatch
} from './command-matcher'

export {
  executeVoiceCommand,
  actionRequiresCallback,
  getCallbackKeyForAction,
  type VoiceCommandContext,
  type ExecutionResult
} from './action-executor'
