import type { EngineInterface, Register } from 'claude-code'

import type { ImageModel, ImageSettings } from '../types'
import { CATALOG_TOOL_MAX_AGE_MS, currentCatalog, fetchCatalog } from './catalog'
import { COMMAND, readSettings } from './config'
import { readKey } from './key'
import { openSettings, registerSettings } from './settings'
import { TOOL_SPEC, describeImage, parseRequest, prepareJob, runEngine } from './tool'

/** Errors after which the person has to change something in the settings, which then open for them. */
const SETTINGS_ERRORS = new Set(['auth'])

/**
 * The `generate_image` tool and the /image-gen-settings pane. The tool checks the request against the chosen model
 * here and leaves the request, the files and the preview to engine/main.mjs, which runs once per image.
 */
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register(TOOL_SPEC)
    await $.command.register({
      name: 'image-gen-settings',
      description: 'Pick the image model and API key Claude uses to make images',
      immediate: true,
    })

    return started
  })

  on('tool.run', { tool: 'mcp__image-gen__generate_image' }, async ($, e) => {
    try {
      return await generate($, e)
    } catch (error) {
      return { deny: error instanceof Error ? error.message : String(error) }
    }
  }).catch(() => ({ deny: 'The image tool failed before it could start. Try again.' }))

  registerSettings(on)
}

async function generate($: EngineInterface, e: Readonly<Record<string, unknown>>) {
  const request = parseRequest(e)
  const settings = await readSettings($)
  const apiKey = await readKey($)
  if (apiKey === undefined) {
    await openSettings($, false)
    return { deny: `No API key is set for image generation yet. The image settings are open now: ask the user to paste their OpenRouter API key there (they can reopen them with /${COMMAND}), then try again.` }
  }
  const model = await findModel($, settings)
  const { job, notes } = prepareJob(request, model, settings)
  const answer = await runEngine($, apiKey, job)
  if (!answer.ok) {
    if (SETTINGS_ERRORS.has(answer.kind)) {
      await openSettings($, false)
      return { deny: `${answer.error} The image settings are open now, so the user can add a working key (or run /${COMMAND}).` }
    }
    return { deny: answer.error }
  }

  return { result: describeImage(answer, request, model, notes) }
}

/** The chosen model's capabilities, from the cached list, or a fresh one when the cache is old or lacks the model. */
async function findModel($: EngineInterface, settings: ImageSettings): Promise<ImageModel> {
  let catalog = await currentCatalog($, CATALOG_TOOL_MAX_AGE_MS).catch(() => undefined)
  let model = catalog?.models.find(m => m.id === settings.model)
  if (model === undefined && catalog !== undefined && Date.now() - catalog.fetchedAt > 60_000) {
    catalog = await fetchCatalog($).catch(() => catalog)
    model = catalog?.models.find(m => m.id === settings.model)
  }
  if (model !== undefined) {
    return model
  }
  if (catalog === undefined) {
    throw new Error("The list of image models couldn't be loaded from OpenRouter. Check the internet connection and try again.")
  }
  await openSettings($, false)
  throw new Error(`The image model in the settings (${settings.model}) isn't offered by OpenRouter anymore. The image settings are open now: ask the user to pick another model there (or with /${COMMAND}).`)
}
