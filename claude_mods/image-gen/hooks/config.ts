import type { EngineInterface } from 'claude-code'

import type { ImageSettings } from '../types'

const SETTINGS_KEY = 'settings'

/** The settings command; register.ts and settings.tsx spell it out where `claude plugin validate` needs a literal. */
export const COMMAND = 'image-gen-settings'
export const DEFAULT_OUTPUT_DIR = '~/Pictures/Generated Images'

/** GPT Image 2 is the model the plugin used before it moved to OpenRouter. */
export const DEFAULT_SETTINGS: ImageSettings = {
  model: 'openai/gpt-image-2',
  resolution: 'auto',
  quality: 'auto',
  outputDir: DEFAULT_OUTPUT_DIR,
}

/** The settings as stored, defaults filling what is missing. Read fresh on every call: other sessions may change them. */
export async function readSettings($: EngineInterface): Promise<ImageSettings> {
  const stored = (await $.store.get(SETTINGS_KEY)) as Partial<ImageSettings> | undefined
  return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) }
}

export async function writeSettings($: EngineInterface, settings: ImageSettings): Promise<void> {
  await $.store.set(SETTINGS_KEY, settings)
}
