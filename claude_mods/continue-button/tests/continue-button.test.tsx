import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin, RenderElement } from 'claude-code'

const PLUGIN = 'continue-button'
const SURFACES = ['terminal', 'desktop', 'mobile'] as const

const SITE = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const

/** Another mod's row, standing in for Commit & Push. */
const OTHER_ROW = { plugin: 'commit-push', tree: { type: 'Text', children: ['commit row'] } as RenderElement }

/** This mod's own row, as its AbovePrompt hook draws it. */
const OWN_ROW = { plugin: PLUGIN, tree: { type: 'Text', children: ['own row'] } as RenderElement }

type Sent = { text: string; origin: PromptOrigin }

/** Stands for the engine beneath the mod: records every prompt the mod submits. */
function recordSubmits(on: On): Sent[] {
  const sent: Sent[] = []
  on('prompt.submit', (_, e) => {
    sent.push({ text: e.text, origin: e.origin })

    return { text: e.text }
  })

  return sent
}

function mountRow($: Engine, surface: (typeof SURFACES)[number], isWorking = false) {
  return $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: { ...SITE, isWorking } })
}

describe('the row of its own', () => {
  test('a press sends "continue" as the person\'s message, on every surface', async ($, on) => {
    const sent = recordSubmits(on)
    for (const surface of SURFACES) {
      const ui = await mountRow($, surface)
      await ui.press({ key: 'continue' })
      await ui.unmount()
    }

    expect(sent).toHaveLength(SURFACES.length)
    for (const one of sent) {
      expect(one.text).toBe('continue')
      expect(one.origin).toMatchObject({ kind: 'plugin', name: PLUGIN, asUser: true })
    }
  })

  test('a press while a turn runs sends nothing, and the button is dimmed', async ($, on) => {
    const sent = recordSubmits(on)
    const ui = await mountRow($, 'desktop', true)

    expect((await ui.find({ key: 'continue' }))?.props.dimColor).toBe(true)
    await ui.press({ key: 'continue' })
    expect(sent).toHaveLength(0)
    await ui.unmount()
  })

  test('two quick presses send once', async ($, on) => {
    const sent = recordSubmits(on)
    const ui = await mountRow($, 'desktop')

    await Promise.all([ui.press({ key: 'continue' }), ui.press({ key: 'continue' })])
    expect(sent).toHaveLength(1)
    await ui.unmount()
  })

  test('a survey keeps the band', async $ => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: { ...SITE, hasSurvey: true } })

    expect(await ui.find({ key: 'continue' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('the band with another mod\'s row', () => {
  test('the button follows the other rows in one horizontal Box, its own row taken out', async ($, on) => {
    const sent = recordSubmits(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePromptList', props: { ...SITE, rows: [OWN_ROW, OTHER_ROW] } })
      const drawn = await ui.drawn()

      if (drawn.type !== 'Box') {
        throw new Error(`expected the band to be one Box, got ${drawn.type}`)
      }
      expect(drawn.props?.flexDirection ?? 'row').toBe('row')
      const children = drawn.children ?? []
      expect(children).toHaveLength(2)
      expect(children[1]).toMatchObject({ type: 'Button', props: { key: 'continue' } })
      expect(await ui.find({ type: 'Text', text: /commit row/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /own row/ })).toBeUndefined()

      await ui.press({ key: 'continue' })
      await ui.unmount()
    }
    expect(sent.map(one => one.text)).toEqual(SURFACES.map(() => 'continue'))
  })

  test('with no other row, the band is left as it is', async $ => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePromptList', props: { ...SITE, rows: [OWN_ROW] } })

    expect(await ui.find({ type: 'Text', text: /own row/ })).toBeDefined()
    expect(await ui.find({ key: 'continue' })).toBeUndefined()
    await ui.unmount()
  })

  test('a survey keeps the band', async $ => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePromptList', props: { ...SITE, hasSurvey: true, rows: [OTHER_ROW] } })

    expect(await ui.find({ key: 'continue' })).toBeUndefined()
    await ui.unmount()
  })
})
