/** A `min`..`max` count a model accepts; `max` 0 when it takes none. */
export type CountRange = { min: number; max: number }

/** One image model of OpenRouter's Images API, cut down to what the plugin uses. Empty lists: not supported. */
export type ImageModel = {
  id: string
  /** The model's own name, without its maker ("Nano Banana 2 (Gemini 3.1 Flash Image)"). */
  title: string
  /** Who makes it ("Google"). */
  maker: string
  /** Seconds since the epoch. */
  created: number
  aspectRatios: string[]
  backgrounds: string[]
  references: CountRange
  resolutions: string[]
  qualities: string[]
  formats: string[]
}

/** The model list as last fetched. */
export type Catalog = { models: ImageModel[]; fetchedAt: number }

/** What the person picked in the settings. `resolution` and `quality` are `auto` or one of the model's values. */
export type ImageSettings = {
  model: string
  resolution: string
  quality: string
  /** Where images go when Claude names no path; `~` for the home folder. */
  outputDir: string
}

/** What OpenRouter says about the saved key. Amounts in US dollars; null when there is no cap or nothing is known. */
export type KeyStatus = {
  /** The key as shown: its start and end. */
  hint: string
  /** What is left to spend: the key's own limit, or the account's credits for a key without one. */
  remaining: number | null
  /** The key's own spending limit; null for a key without one. */
  limit: number | null
  /** ISO time the key stops working, when it has one. */
  expiresAt: string | null
}

/** The pane's data besides the settings. */
export type PaneData = {
  catalog?: Catalog
  isLoadingCatalog: boolean
  catalogError?: string
  /** The saved key's status, once checked; `hint` alone while checking. */
  key?: KeyStatus
  hasKey: boolean
  isCheckingKey: boolean
  keyError?: string
  isEditingKey: boolean
  isConfirmingRemove: boolean
  /** What the person typed into the model search. */
  query: string
  folderError?: string
}

/** The arguments of the tool the plugin registers, as its input schema in hooks/tool.ts declares them. */
export type GenerateImageInput = {
  prompt: string
  reference_images?: string[]
  aspect_ratio?: string
  transparent_background?: boolean
  output_path?: string
  overwrite?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'image-gen': {
      settings: Shaped<ImageSettings>
      pane: Shaped<PaneData>
    }
  }
  interface McpToolInputs {
    'mcp__image-gen__generate_image': GenerateImageInput
  }
}
