import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, ResolveInput } from 'claude-code'

import type { ImageModel, KeyStatus, PaneData, ImageSettings } from '../types'
import { CATALOG_PANE_MAX_AGE_MS, capabilityNotes, fetchCatalog, readCatalog, searchModels } from './catalog'
import { COMMAND, DEFAULT_OUTPUT_DIR, DEFAULT_SETTINGS, readSettings, writeSettings } from './config'
import { checkKey, deleteKey, isKeyShaped, keyHint, readKey, saveKey } from './key'

export const PANE = 'image-gen-settings'
const TITLE = 'Image Generation'
const KEYS_URL = 'https://openrouter.ai/settings/keys'
/** How many models the search shows at once. */
const RESULT_ROWS = 6

const INITIAL_PANE: PaneData = {
  isLoadingCatalog: false,
  hasKey: false,
  isCheckingKey: false,
  isEditingKey: false,
  isConfirmingRemove: false,
  query: '',
}

// Change a tag when the value's fields change: it declines what an earlier version stored, which outlives a reload.
const settingsState = atom({ plugin: 'image-gen', key: 'settings' } as const, DEFAULT_SETTINGS, { shape: 'settings-1' })
const paneState = atom({ plugin: 'image-gen', key: 'pane' } as const, INITIAL_PANE, { shape: 'pane-1' })

type PaneRender = ResolveInput<'Pane'>

export function registerSettings(on: On): void {
  on('command.run', { command: 'image-gen-settings' }, async $ => {
    await openSettings($, true)

    return {}
  }).catch($ => {
    $.ui.toast(`${TITLE} could not open. Try /${COMMAND} again.`)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const settings = await read($, settingsState)
    const data = await read($, paneState)

    return e.props.placement === 'widget' ? glance($, e, settings, data) : pane($, e, settings, data)
  })
}

/**
 * Opens the pane with what the store holds now (another session may have changed it), then checks the key and, when
 * stale, the model list. `focus` is for the person's own command; the tool opens it without taking the keyboard. The
 * pane is up and says it is checking while this waits for both.
 */
export async function openSettings($: EngineInterface, focus: boolean): Promise<void> {
  const [settings, catalog] = await Promise.all([readSettings($), readCatalog($)])
  await update($, settingsState, () => settings)
  await update($, paneState, data => ({ ...INITIAL_PANE, catalog: catalog ?? data.catalog, key: data.key, hasKey: data.hasKey }))
  await $.ui.open({ id: PANE, title: TITLE, ...(focus ? { focus: true, closeOnEscape: true } : {}) })
  const isStale = !catalog || Date.now() - catalog.fetchedAt > CATALOG_PANE_MAX_AGE_MS
  await Promise.all([refreshKey($), isStale ? loadCatalog($) : undefined])
}

async function refreshKey($: EngineInterface): Promise<void> {
  await update($, paneState, data => ({ ...data, isCheckingKey: true, keyError: undefined }))
  try {
    const key = await readKey($)
    if (key === undefined) {
      await update($, paneState, data => ({ ...data, isCheckingKey: false, hasKey: false, key: undefined, isEditingKey: true }))
      return
    }
    const known: KeyStatus = { hint: keyHint(key), remaining: null, limit: null, expiresAt: null }
    await update($, paneState, data => ({ ...data, hasKey: true, key: data.key?.hint === known.hint ? data.key : known }))
    const status = await checkKey($, key)
    await update($, paneState, data => ({
      ...data,
      isCheckingKey: false,
      key: status ?? known,
      keyError: status ? undefined : 'OpenRouter rejected this key. It may be deleted or expired, so add a new one.',
    }))
  } catch (error) {
    await update($, paneState, data => ({ ...data, isCheckingKey: false, keyError: `Couldn't check the key: ${messageOf(error)}` }))
  }
}

async function submitKey($: EngineInterface, typed: string): Promise<void> {
  const key = typed.trim()
  if (key === '') {
    return
  }
  if (!isKeyShaped(key)) {
    await update($, paneState, data => ({ ...data, keyError: "That doesn't look like an OpenRouter key. It starts with sk-or-." }))
    return
  }
  await update($, paneState, data => ({ ...data, isCheckingKey: true, keyError: undefined }))
  try {
    const status = await checkKey($, key)
    if (!status) {
      await update($, paneState, data => ({ ...data, isCheckingKey: false, keyError: "OpenRouter didn't accept this key." }))
      return
    }
    await saveKey($, key)
    await update($, paneState, data => ({ ...data, isCheckingKey: false, hasKey: true, key: status, isEditingKey: false }))
  } catch (error) {
    await update($, paneState, data => ({ ...data, isCheckingKey: false, keyError: messageOf(error) }))
  }
}

async function removeKey($: EngineInterface): Promise<void> {
  try {
    await deleteKey($)
    await update($, paneState, data => ({ ...data, hasKey: false, key: undefined, isEditingKey: true, isConfirmingRemove: false, keyError: undefined }))
  } catch (error) {
    await update($, paneState, data => ({ ...data, isConfirmingRemove: false, keyError: messageOf(error) }))
  }
}

async function loadCatalog($: EngineInterface): Promise<void> {
  await update($, paneState, data => ({ ...data, isLoadingCatalog: true, catalogError: undefined }))
  try {
    const catalog = await fetchCatalog($)
    await update($, paneState, data => ({ ...data, catalog, isLoadingCatalog: false }))
  } catch (error) {
    await update($, paneState, data => ({ ...data, isLoadingCatalog: false, catalogError: messageOf(error) }))
  }
}

/** Saves a change to the settings in the store, where the tool reads them, and in the pane's state. */
async function changeSettings($: EngineInterface, change: (settings: ImageSettings) => ImageSettings): Promise<void> {
  const next = change(await readSettings($))
  await writeSettings($, next)
  await update($, settingsState, () => next)
}

async function pickModel($: EngineInterface, model: ImageModel): Promise<void> {
  await changeSettings($, settings => ({
    ...settings,
    model: model.id,
    // A level the new model does not offer would be dropped silently, so the pick starts from Auto instead.
    resolution: model.resolutions.includes(settings.resolution) ? settings.resolution : 'auto',
    quality: model.qualities.includes(settings.quality) ? settings.quality : 'auto',
  }))
  await update($, paneState, data => ({ ...data, query: '' }))
}

async function submitFolder($: EngineInterface, typed: string): Promise<void> {
  const folder = typed.trim() === '' ? DEFAULT_OUTPUT_DIR : typed.trim().replace(/(.)\/+$/, '$1')
  if (!folder.startsWith('/') && folder !== '~' && !folder.startsWith('~/')) {
    await update($, paneState, data => ({ ...data, folderError: `Use a full path, like ${DEFAULT_OUTPUT_DIR}.` }))
    return
  }
  await changeSettings($, settings => ({ ...settings, outputDir: folder }))
  await update($, paneState, data => ({ ...data, folderError: undefined }))
}

function pane($: EngineInterface, e: PaneRender, settings: ImageSettings, data: PaneData) {
  const { Box, Text } = $.ui.resolve(e)
  const model = data.catalog?.models.find(m => m.id === settings.model)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text size="heading" weight="semibold">
          {TITLE}
        </Text>
        <Text dimColor size="footnote">
          The model and key Claude uses whenever it makes or edits an image for you.
        </Text>
      </Box>
      {keySection($, e, data)}
      {modelSection($, e, settings, data, model)}
      {outputSection($, e, settings, data, model)}
    </Box>
  )
}

function keySection($: EngineInterface, e: PaneRender, data: PaneData): RenderElement {
  const { Box, Button, Input, Link, Text } = $.ui.resolve(e)
  const title = <Text weight="semibold">API Key</Text>
  const error = data.keyError && <Text color="error">{data.keyError}</Text>

  if (data.isEditingKey || !data.hasKey) {
    return (
      <Box key="key" flexDirection="column" gap={1}>
        {title}
        <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={1}>
          <Text>Paste your OpenRouter API key. It stays in your Mac's Keychain.</Text>
          <Input key="key-input" placeholder="sk-or-v1-…" submitLabel={data.isCheckingKey ? 'checking' : 'save'} autoFocus onSubmit={value => submitKey($, value)} />
          {error}
          <Box gap={2} alignItems="center" flexWrap="wrap">
            <Link href={KEYS_URL} label="Get a Key on OpenRouter" />
            {data.hasKey && (
              <Button key="key-cancel" dimColor label="Cancel" onPress={() => update($, paneState, d => ({ ...d, isEditingKey: false, keyError: undefined }))} />
            )}
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box key="key" flexDirection="column" gap={1}>
      {title}
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box gap={1} flexWrap="wrap">
          <Text weight="medium">OpenRouter</Text>
          <Text dimColor mono>
            {data.key?.hint ?? ''}
          </Text>
        </Box>
        {keyFacts($, e, data)}
        {error}
        {data.isConfirmingRemove ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="warning">Remove the key from this Mac? OpenRouter never shows a key twice, so keep a copy if you still need it.</Text>
            <Box gap={1} marginTop={1}>
              <Button key="key-remove-confirm" variant="primary" label="Remove Key" onPress={() => removeKey($)} />
              <Button key="key-remove-cancel" label="Cancel" onPress={() => update($, paneState, d => ({ ...d, isConfirmingRemove: false }))} />
            </Box>
          </Box>
        ) : (
          <Box gap={1} marginTop={1}>
            <Button key="key-change" label="Change Key" onPress={() => update($, paneState, d => ({ ...d, isEditingKey: true, keyError: undefined }))} />
            <Button key="key-remove" dimColor label="Remove Key" onPress={() => update($, paneState, d => ({ ...d, isConfirmingRemove: true }))} />
          </Box>
        )}
      </Box>
    </Box>
  )
}

/** The key's budget and expiry, in one line; an expiry within a day stands out. */
function keyFacts($: EngineInterface, e: PaneRender, data: PaneData): RenderElement | undefined {
  const { Box, Text } = $.ui.resolve(e)
  const key = data.key
  if (data.isCheckingKey && (key?.remaining ?? null) === null) {
    return (
      <Text dimColor size="footnote">
        Checking the key
      </Text>
    )
  }
  if (!key || data.keyError) {
    return undefined
  }
  const budget =
    key.remaining === null ? undefined : key.limit === null ? `${dollars(key.remaining)} credits left` : `${dollars(key.remaining)} of ${dollars(key.limit)} left on this key`
  const expiry = key.expiresAt === null ? undefined : expiryText(Date.parse(key.expiresAt) - Date.now())
  if (budget === undefined && expiry === undefined) {
    return undefined
  }

  return (
    <Box columnGap={1} flexWrap="wrap">
      {budget !== undefined && (
        <Text dimColor size="footnote">
          {budget}
        </Text>
      )}
      {expiry !== undefined && (
        <Text size="footnote" dimColor={!expiry.isSoon} color={expiry.isOver ? 'error' : expiry.isSoon ? 'warning' : undefined}>
          {budget === undefined ? expiry.text : `· ${expiry.text}`}
        </Text>
      )}
    </Box>
  )
}

function modelSection($: EngineInterface, e: PaneRender, settings: ImageSettings, data: PaneData, model: ImageModel | undefined): RenderElement {
  const { Box, Button, Input, Link, Progress, Text } = $.ui.resolve(e)
  const models = data.catalog?.models ?? []
  // The chosen model has its own card above, so the list offers the others
  const results = searchModels(models, data.query).filter(option => option.id !== settings.model)
  const shown = results.slice(0, RESULT_ROWS)

  let current: RenderElement
  if (model) {
    current = (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Text weight="medium">{model.title}</Text>
        <Text dimColor size="footnote">
          {model.maker} · {model.id}
        </Text>
        <Text dimColor size="footnote">
          {capabilityNotes(model).join(' · ')}
        </Text>
        <Link href={`https://openrouter.ai/${model.id}`} label="Details and Pricing" />
      </Box>
    )
  } else if (data.catalog) {
    current = (
      <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
        <Text weight="medium">{settings.model}</Text>
        <Text color="warning">OpenRouter doesn't offer this model for images anymore. Pick another one below.</Text>
      </Box>
    )
  } else {
    current = <Text dimColor>{settings.model}</Text>
  }

  let list: RenderElement
  if (data.catalogError && models.length === 0) {
    list = (
      <Box flexDirection="column" gap={1}>
        <Text color="error">Couldn't load the models: {data.catalogError}</Text>
        <Box>
          <Button key="catalog-retry" label="Try Again" onPress={() => loadCatalog($)} />
        </Box>
      </Box>
    )
  } else if (models.length === 0) {
    list = <Progress label="Loading the models" />
  } else {
    list = (
      <Box flexDirection="column">
        <Input
          key="model-search"
          placeholder={`Search ${models.length} image models`}
          value={data.query}
          submitLabel="pick first"
          onInput={value => update($, paneState, d => ({ ...d, query: value }))}
          onSubmit={value => {
            const first = searchModels(models, value).find(option => option.id !== settings.model)
            return first && value.trim() !== '' ? pickModel($, first) : undefined
          }}
        />
        {shown.map(option => (
          <Button key={`model-${option.id}`} plain onPress={() => pickModel($, option)}>
            {option.title} <Text dimColor>{option.maker}</Text>
          </Button>
        ))}
        <Text dimColor size="footnote">
          {resultsLine(results.length, shown.length, data.query, models.length)}
        </Text>
      </Box>
    )
  }

  return (
    <Box key="model" flexDirection="column" gap={1}>
      <Text weight="semibold">Model</Text>
      {current}
      {list}
    </Box>
  )
}

function resultsLine(matches: number, shown: number, query: string, total: number): string {
  if (query.trim() === '') {
    return matches > shown ? `The ${shown} newest of ${total}. Type to search them all.` : 'Type to search by name or maker.'
  }
  if (matches === 0) {
    return 'No model matches. Try the maker or a shorter name.'
  }
  return matches > shown ? `${shown} of ${matches} matches. Keep typing to narrow it down.` : `${matches} ${matches === 1 ? 'match' : 'matches'}`
}

function outputSection($: EngineInterface, e: PaneRender, settings: ImageSettings, data: PaneData, model: ImageModel | undefined): RenderElement {
  const { Box, Input, Select, Text } = $.ui.resolve(e)
  const resolutions = model?.resolutions ?? []
  const qualities = model?.qualities.filter(q => q !== 'auto') ?? []

  return (
    <Box key="output" flexDirection="column" gap={1}>
      <Text weight="semibold">Output</Text>
      {resolutions.length > 0 && (
        <Select
          key="resolution"
          label="Resolution"
          value={resolutions.includes(settings.resolution) ? settings.resolution : 'auto'}
          options={[{ value: 'auto', label: 'Auto' }, ...resolutions.map(value => ({ value, label: value }))]}
          onSelect={value => changeSettings($, s => ({ ...s, resolution: value }))}
        />
      )}
      {qualities.length > 0 && (
        <Select
          key="quality"
          label="Quality"
          value={qualities.includes(settings.quality) ? settings.quality : 'auto'}
          options={[{ value: 'auto', label: 'Auto' }, ...qualities.map(value => ({ value, label: qualityLabel(value) }))]}
          onSelect={value => changeSettings($, s => ({ ...s, quality: value }))}
        />
      )}
      <Box flexDirection="column">
        <Input key="folder" label="Default Folder" value={settings.outputDir} submitLabel="save" onSubmit={value => submitFolder($, value)} />
        {data.folderError ? (
          <Text color="error">{data.folderError}</Text>
        ) : (
          <Text dimColor size="footnote">
            Where images go when Claude doesn't pick a path itself.
          </Text>
        )}
      </Box>
    </Box>
  )
}

/** The minimized pane: one line that reads at a glance, since clicks may not reach it. */
function glance($: EngineInterface, e: PaneRender, settings: ImageSettings, data: PaneData) {
  const { Text } = $.ui.resolve(e)
  const model = data.catalog?.models.find(m => m.id === settings.model)

  return <Text dimColor>{data.hasKey ? `Images: ${model?.title ?? settings.model}` : 'Images need an API key'}</Text>
}

const QUALITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High', max: 'Max' }

function qualityLabel(value: string): string {
  return QUALITY_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1)
}

function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function expiryText(leftMs: number): { text: string; isSoon: boolean; isOver: boolean } {
  if (!Number.isFinite(leftMs)) {
    return { text: '', isSoon: false, isOver: false }
  }
  if (leftMs <= 0) {
    return { text: 'Expired', isSoon: true, isOver: true }
  }
  const minutes = Math.round(leftMs / 60_000)
  const hours = Math.round(leftMs / 3_600_000)
  const days = Math.round(leftMs / 86_400_000)
  const text = minutes < 90 ? `Expires in ${Math.max(1, minutes)} min` : hours < 48 ? `Expires in ${hours} hours` : `Expires in ${days} days`

  return { text, isSoon: leftMs < 86_400_000, isOver: false }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
