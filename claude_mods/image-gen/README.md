# image-gen

A Claude Code mod that gives Claude a `generate_image` tool for creating and editing raster images through [OpenRouter](https://openrouter.ai)'s Images API, plus a settings pane for the API key, the image model and output defaults.

## Requirements

- macOS (the mod keeps the API key in the login Keychain and uses `sips` for conversions and previews).
- Node.js 20.3 or newer, found on the session's `PATH`, in `/opt/homebrew/bin` or in `/usr/local/bin`.
- An OpenRouter API key with credits.

## Install

Copy this folder to `~/.claude/mods/image-gen`, then register and install it from a terminal:

```bash
claude plugin marketplace add ~/.claude/mods/image-gen
```

```bash
claude plugin install image-gen@claudeapp-imagegen --scope user
```

It loads in every Code session started afterwards, in the desktop app's Code tab and in the terminal. Edits to the folder reach running sessions with `/reload-plugins`. Then run `/image-gen-settings` once to add your OpenRouter API key.

## Settings

`/image-gen-settings` opens the pane (it also works while Claude is busy):

- **API Key**: paste a key; OpenRouter checks it before it is saved to the Keychain (service "Claude Image Gen (OpenRouter)"). The pane shows what is left to spend and when the key expires.
- **Model**: search all of OpenRouter's image models by name, maker or id; the card shows what the chosen model can do. Vector-only models are left out, since the tool saves PNG and JPEG files.
- **Output**: resolution and quality, offered only when the chosen model has them, and the default folder for images saved without a path.

When Claude calls the tool without a key, or with a key OpenRouter rejects, the pane opens by itself.

## The tool

`generate_image` makes one image per call from a prompt, or edits, restyles or combines local reference images.

| Argument | Purpose |
| --- | --- |
| `prompt` | Required. Self-contained description of the image or of the edit. |
| `reference_images` | Absolute paths of images to edit or use as references, up to what the model takes. PNG, JPEG and WebP are sent as they are; other formats macOS can read are converted to PNG first. |
| `aspect_ratio` | `width:height` between 1:3 and 3:1. The model's closest offered shape is used, and the result says so when it differs. `auto` or omitted lets the model choose. |
| `transparent_background` | PNG with real transparency. |
| `output_path` | Absolute `.png`, `.jpg` or `.jpeg` path. Defaults to a new file in the default folder. |
| `overwrite` | Allows replacing an existing `output_path`. Without it, the call fails before anything is generated. |

The result holds the saved path, the pixel size, the model, the cost OpenRouter reported and a JPEG preview of at most 1024 px for Claude to check.

### Model capabilities

The Images API drops request fields a model does not support and still bills the image. The mod therefore checks every request against the chosen model's capabilities from OpenRouter's model list (cached for a day) and refuses, before anything is spent, what the model cannot do: transparent backgrounds, reference images, or too many or too few of them. Options the model lacks (resolution, quality, output format) are left out of the request.

## Layout

- `hooks/register.ts`: entry point; registers the tool and the command and runs a generation.
- `hooks/tool.ts`: the tool's definition, argument checks, the request for one model, and running the engine.
- `hooks/catalog.ts`: OpenRouter's model list, capabilities, aspect ratio matching and model search.
- `hooks/key.ts`: the key in the Keychain and its status at OpenRouter.
- `hooks/config.ts`: the stored settings and their defaults.
- `hooks/settings.tsx`: the `/image-gen-settings` pane.
- `engine/main.mjs`: started once per image; reads the job on standard input, calls the API, saves the image and makes the preview (`openrouter.mjs`, `image-files.mjs`).
- `types/index.d.ts`: the mod's state and tool input types.

## Development

See [TESTING_GUIDELINES.md](TESTING_GUIDELINES.md).
