import type { EngineInterface } from 'claude-code'

import type { Catalog, CountRange, ImageModel } from '../types'

export const API_BASE = 'https://openrouter.ai/api/v1'
const CATALOG_KEY = 'catalog'

/** How old the cached model list may get before the pane fetches it again. */
export const CATALOG_PANE_MAX_AGE_MS = 6 * 60 * 60_000
/** How old it may get before a generation fetches it again first: a day, so a model's changed limits are seen. */
export const CATALOG_TOOL_MAX_AGE_MS = 24 * 60 * 60_000

type Descriptor = { type?: string; values?: unknown; min?: unknown; max?: unknown }
type RawModel = { id?: unknown; name?: unknown; created?: unknown; supported_parameters?: Record<string, Descriptor> }

export async function readCatalog($: EngineInterface): Promise<Catalog | undefined> {
  const stored = (await $.store.get(CATALOG_KEY)) as Catalog | undefined
  return stored && Array.isArray(stored.models) ? stored : undefined
}

/** Fetches the image models (no key needed) and keeps them in the store. */
export async function fetchCatalog($: EngineInterface): Promise<Catalog> {
  const response = await $.http.fetch(`${API_BASE}/images/models`)
  if (!response.ok) {
    throw new Error(`OpenRouter answered HTTP ${response.status}`)
  }
  const raw = JSON.parse(response.text) as { data?: RawModel[] }
  const models = (raw.data ?? []).map(parseModel).filter((model): model is ImageModel => model !== undefined && isRaster(model))
  if (models.length === 0) {
    throw new Error('OpenRouter listed no image models')
  }
  const catalog = { models, fetchedAt: Date.now() }
  await $.store.set(CATALOG_KEY, catalog)

  return catalog
}

/** The cached list while it is younger than `maxAgeMs`, else a fresh one; the cached one when fetching fails. */
export async function currentCatalog($: EngineInterface, maxAgeMs: number): Promise<Catalog | undefined> {
  const cached = await readCatalog($)
  if (cached && Date.now() - cached.fetchedAt < maxAgeMs) {
    return cached
  }
  try {
    return await fetchCatalog($)
  } catch (error) {
    if (cached) {
      return cached
    }
    throw error
  }
}

function parseModel(raw: RawModel): ImageModel | undefined {
  if (typeof raw.id !== 'string' || raw.id === '') {
    return undefined
  }
  const params = raw.supported_parameters ?? {}
  const fullName = typeof raw.name === 'string' && raw.name !== '' ? raw.name : raw.id
  const cut = fullName.indexOf(': ')

  return {
    id: raw.id,
    title: cut > 0 ? fullName.slice(cut + 2) : fullName,
    maker: cut > 0 ? fullName.slice(0, cut) : raw.id.split('/')[0] ?? '',
    created: typeof raw.created === 'number' ? raw.created : 0,
    aspectRatios: values(params.aspect_ratio),
    backgrounds: values(params.background),
    references: range(params.input_references),
    resolutions: values(params.resolution),
    qualities: values(params.quality),
    formats: values(params.output_format),
  }
}

function values(descriptor: Descriptor | undefined): string[] {
  return descriptor?.type === 'enum' && Array.isArray(descriptor.values) ? descriptor.values.filter((v): v is string => typeof v === 'string') : []
}

function range(descriptor: Descriptor | undefined): CountRange {
  if (descriptor?.type !== 'range') {
    return { min: 0, max: 0 }
  }
  const min = typeof descriptor.min === 'number' ? descriptor.min : 0
  const max = typeof descriptor.max === 'number' ? descriptor.max : 0

  return { min, max }
}

/** Vector-only models answer SVG, which the tool does not save. */
function isRaster(model: ImageModel): boolean {
  return model.formats.length === 0 || model.formats.some(format => format === 'png' || format === 'jpeg' || format === 'webp')
}

export function canMakeTransparent(model: ImageModel): boolean {
  const hasAlphaFormat = model.formats.length === 0 || model.formats.includes('png') || model.formats.includes('webp')
  return model.backgrounds.includes('transparent') && hasAlphaFormat
}

/** Width divided by height of a ratio as the API spells it ("16:9", "2.35:1"), or NaN. */
export function ratioValue(ratio: string): number {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio)
  return match ? Number(match[1]) / Number(match[2]) : Number.NaN
}

/** The model's ratio closest in shape to `wanted` ("W:H"), or undefined when it offers none. */
export function closestAspectRatio(model: ImageModel, wanted: string): string | undefined {
  const target = Math.log(ratioValue(wanted))
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const ratio of model.aspectRatios) {
    const value = ratioValue(ratio)
    if (!Number.isFinite(value)) {
      continue
    }
    const distance = Math.abs(Math.log(value) - target)
    if (distance < bestDistance - 1e-9) {
      best = ratio
      bestDistance = distance
    }
  }

  return best
}

/** The models matching every word of `query` in their name, maker or id, best matches first. */
export function searchModels(models: readonly ImageModel[], query: string): ImageModel[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const newestFirst = (a: ImageModel, b: ImageModel) => b.created - a.created
  if (words.length === 0) {
    return [...models].sort(newestFirst)
  }
  const scored: { model: ImageModel; score: number }[] = []
  for (const model of models) {
    const title = model.title.toLowerCase()
    const haystack = `${title} ${model.maker.toLowerCase()} ${model.id.toLowerCase()}`
    if (!words.every(word => haystack.includes(word))) {
      continue
    }
    scored.push({ model, score: matchScore(title, model.id.toLowerCase(), words.join(' ')) })
  }

  return scored.sort((a, b) => b.score - a.score || newestFirst(a.model, b.model)).map(entry => entry.model)
}

/** How well a title or id matches the typed phrase: at the start, at a word's start, anywhere in the title, in the id. */
function matchScore(title: string, id: string, phrase: string): number {
  if (title.startsWith(phrase)) {
    return 4
  }
  if (!title.includes(phrase)) {
    return id.includes(phrase) ? 1 : 0
  }
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`[^a-z0-9]${escaped}`).test(title) ? 3 : 2
}

/** Short facts about what a model can do, for the pane. */
export function capabilityNotes(model: ImageModel): string[] {
  const notes: string[] = []
  const { min, max } = model.references
  if (min > 0) {
    notes.push(min === 1 ? 'Needs a reference image' : `Needs ${min} reference images`)
  }
  if (max > 0) {
    notes.push(`Up to ${max} reference image${max === 1 ? '' : 's'}`)
  } else {
    notes.push('No reference images')
  }
  notes.push(canMakeTransparent(model) ? 'Transparent backgrounds' : 'No transparent backgrounds')
  if (model.resolutions.length > 0) {
    const first = model.resolutions[0]
    const last = model.resolutions[model.resolutions.length - 1]
    notes.push(first === last ? `${first} resolution` : `${first} to ${last}`)
  }

  return notes
}
