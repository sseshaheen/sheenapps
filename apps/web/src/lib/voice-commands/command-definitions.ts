/**
 * Voice Command Definitions
 *
 * Maps Arabic command phrases to actions that can be triggered via voice input.
 * Each command has a primary phrase and optional aliases for recognition flexibility.
 */

export type VoiceAction =
  // Navigation
  | 'navigate_back'
  | 'navigate_home'
  // Build actions
  | 'start_build'
  | 'stop_build'
  // UI actions
  | 'open_settings'
  | 'open_preview'
  | 'deploy'
  // CMS actions
  | 'open_cms'
  | 'add_content'
  // Helper actions
  | 'open_helper'
  | 'close_helper'

export interface VoiceCommandDefinition {
  /** Primary action identifier */
  action: VoiceAction
  /** Alternative phrases that trigger the same action */
  aliases: string[]
  /** Minimum confidence required (0-1) for this command */
  minConfidence?: number
  /** Category for grouping in UI/docs */
  category: 'navigation' | 'build' | 'ui' | 'cms' | 'helper'
}

/**
 * Arabic voice commands mapped to actions.
 *
 * Command design principles:
 * - Short, common phrases (1-3 words)
 * - Include regional variations (Gulf, Egyptian, Levantine)
 * - Avoid ambiguous words that could trigger false positives
 */
export const VOICE_COMMANDS: Record<string, VoiceCommandDefinition> = {
  // Navigation commands
  'ارجع': {
    action: 'navigate_back',
    aliases: ['رجوع', 'للخلف', 'رجّعني', 'الى الخلف'],
    category: 'navigation'
  },
  'الصفحة الرئيسية': {
    action: 'navigate_home',
    aliases: ['الرئيسية', 'البداية', 'الصفحه الرئيسيه', 'الهوم'],
    category: 'navigation'
  },

  // Build actions
  'ابني': {
    action: 'start_build',
    aliases: ['ابدأ البناء', 'شغل', 'ابني الموقع', 'ابدا البناء', 'بلّش', 'يلا ابني'],
    category: 'build',
    minConfidence: 0.7 // Higher threshold for build actions
  },
  'أوقف': {
    action: 'stop_build',
    aliases: ['وقف', 'الغاء', 'أوقف البناء', 'الغي', 'وقّف', 'ستوب'],
    category: 'build',
    minConfidence: 0.7
  },

  // UI actions
  'افتح الإعدادات': {
    action: 'open_settings',
    aliases: ['اعدادات', 'الاعدادات', 'سيتنجز', 'الضبط'],
    category: 'ui'
  },
  'افتح المعاينة': {
    action: 'open_preview',
    aliases: ['معاينة', 'شاهد', 'بريفيو', 'شوف الموقع', 'افتح الموقع'],
    category: 'ui'
  },
  'انشر': {
    action: 'deploy',
    aliases: ['نشر', 'رفع', 'ديبلوي', 'نزّل الموقع', 'حدّث الموقع'],
    category: 'ui',
    minConfidence: 0.7 // Higher threshold for deploy
  },

  // CMS actions
  'افتح المحتوى': {
    action: 'open_cms',
    aliases: ['المحتوى', 'مدير المحتوى', 'سي ام اس', 'ادارة المحتوى'],
    category: 'cms'
  },
  'أضف محتوى': {
    action: 'add_content',
    aliases: ['اضف محتوى', 'محتوى جديد', 'اضافة محتوى', 'انشئ محتوى'],
    category: 'cms'
  },

  // Helper actions
  'ساعدني': {
    action: 'open_helper',
    aliases: ['مساعدة', 'هلب', 'عندي سؤال', 'افتح المساعد'],
    category: 'helper'
  },
  'أغلق المساعد': {
    action: 'close_helper',
    aliases: ['اغلق المساعد', 'خلاص', 'شكرا'],
    category: 'helper'
  }
}

/**
 * Get all command phrases (primary + aliases) for a given action
 */
export function getPhrasesForAction(action: VoiceAction): string[] {
  const phrases: string[] = []

  for (const [primary, def] of Object.entries(VOICE_COMMANDS)) {
    if (def.action === action) {
      phrases.push(primary, ...def.aliases)
    }
  }

  return phrases
}

/**
 * Get all unique actions
 */
export function getAllActions(): VoiceAction[] {
  const actions = new Set<VoiceAction>()
  for (const def of Object.values(VOICE_COMMANDS)) {
    actions.add(def.action)
  }
  return Array.from(actions)
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: VoiceCommandDefinition['category']): Array<{ phrase: string, definition: VoiceCommandDefinition }> {
  return Object.entries(VOICE_COMMANDS)
    .filter(([_, def]) => def.category === category)
    .map(([phrase, definition]) => ({ phrase, definition }))
}
