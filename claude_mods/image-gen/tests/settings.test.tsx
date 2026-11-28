import { expect, test } from 'claude-code/testing'

import { KEY, OTHER_KEY, PANE, SURFACES, fakeHost, openPane } from './fakes'

test('the command shows the saved key, the chosen model and its options, on every surface', async ($, on) => {
  fakeHost(on, { key: KEY })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await openPane($)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /sk-or-v1-pla…aaaa/ }))?.text).toContain('sk-or-v1-pla')
    expect(await ui.find({ type: 'Text', text: /\$7\.50 of \$10\.00/ })).toBeDefined()
    expect(await ui.find({ key: 'key-change' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^GPT Image 2$/ })).toBeDefined()
    // GPT Image 2 has quality levels but no resolutions
    expect(await ui.find({ key: 'quality' })).toBeDefined()
    expect(await ui.find({ key: 'resolution' })).toBeUndefined()
    expect(await ui.find({ key: 'folder' })).toBeDefined()
    await ui.unmount()
  }
})

test('without a key the pane asks for one, and only a key OpenRouter accepts is saved', async ($, on) => {
  const host = fakeHost(on)
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'key-input' })).toBeDefined()

  await ui.input({ key: 'key-input', text: 'not a key' })
  expect(host.keychain.key).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /doesn't look like/ })).toBeDefined()

  await ui.input({ key: 'key-input', text: 'sk-or-v1-placeholder-key-openrouter-rejects' })
  expect(host.keychain.key).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /didn't accept/ })).toBeDefined()

  await ui.input({ key: 'key-input', text: `  ${KEY}  ` })
  expect(host.keychain.key).toBe(KEY)
  expect(await ui.find({ key: 'key-input' })).toBeUndefined()
  expect(await ui.find({ key: 'key-change' })).toBeDefined()
  await ui.unmount()
})

test('Change Key replaces the key, and Cancel keeps the old one', async ($, on) => {
  const host = fakeHost(on, { key: KEY })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'key-change' })
  await ui.press({ key: 'key-cancel' })
  expect(await ui.find({ key: 'key-input' })).toBeUndefined()
  expect(host.keychain.key).toBe(KEY)

  await ui.press({ key: 'key-change' })
  await ui.input({ key: 'key-input', text: OTHER_KEY })
  expect(host.keychain.key).toBe(OTHER_KEY)
  await ui.unmount()
})

test('Remove Key asks first, then takes the key out of the Keychain', async ($, on) => {
  const host = fakeHost(on, { key: KEY })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'key-remove' })
  expect(host.keychain.key).toBe(KEY)
  await ui.press({ key: 'key-remove-cancel' })
  expect(await ui.find({ key: 'key-remove-confirm' })).toBeUndefined()

  await ui.press({ key: 'key-remove' })
  await ui.press({ key: 'key-remove-confirm' })
  expect(host.keychain.key).toBeUndefined()
  expect(await ui.find({ key: 'key-input' })).toBeDefined()
  await ui.unmount()
})

test('the model search finds models by name or maker, and a pick is saved with options it supports', async ($, on) => {
  const host = fakeHost(on, { key: KEY, store: { settings: { model: 'openai/gpt-image-2', resolution: 'auto', quality: 'high', outputDir: '~/Pictures' } } })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Vector-only models make SVG, which the tool does not save, so they are not offered
  expect(await ui.find({ key: 'model-recraft/recraft-v4-vector' })).toBeUndefined()

  await ui.input({ key: 'model-search', text: 'google', kind: 'change' })
  expect(await ui.find({ key: 'model-google/gemini-3.1-flash-image' })).toBeDefined()
  expect(await ui.find({ key: 'model-openai/gpt-image-2' })).toBeUndefined()

  await ui.press({ key: 'model-google/gemini-3.1-flash-image' })
  expect(host.store.get('settings')).toMatchObject({ model: 'google/gemini-3.1-flash-image', quality: 'auto' })
  expect(await ui.find({ key: 'resolution' })).toBeDefined()
  expect(await ui.find({ key: 'quality' })).toBeUndefined()

  await ui.select({ key: 'resolution', value: '2K' })
  expect(host.store.get('settings')).toMatchObject({ resolution: '2K' })

  // Enter in the search picks the best match
  await ui.input({ key: 'model-search', text: 'mini' })
  expect(host.store.get('settings')).toMatchObject({ model: 'openai/gpt-image-1-mini', resolution: 'auto' })
  await ui.unmount()
})

test('the default folder takes full paths only', async ($, on) => {
  const host = fakeHost(on, { key: KEY })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'folder', text: 'relative/folder' })
  expect(host.store.get('settings')).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /full path/ })).toBeDefined()

  await ui.input({ key: 'folder', text: '~/Art/' })
  expect(host.store.get('settings')).toMatchObject({ outputDir: '~/Art' })
  await ui.unmount()
})

test('the minimized pane reads at a glance', async ($, on) => {
  fakeHost(on, { key: KEY })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'widget' }, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toContain('GPT Image 2')
  await ui.unmount()
})
