import type { EngineInterface, Register, RenderElement, ResolveInput } from 'claude-code'

/** The mod's name, as plugin.json gives it: how the band tells this mod's own row apart from the others. */
const PLUGIN = 'continue-button'

/** What a press sends, as the person's own message. */
const MESSAGE = 'continue'

/** What the button needs of a band render: the surface it draws on and whether a turn runs. */
type BandRender = ResolveInput<'AbovePrompt' | 'AbovePromptList'> & { props: { isWorking: boolean } }

// Set synchronously on a press, before the new turn redraws the button dimmed: a quick second press must not send twice
let isSending = false

export const register: Register = on => {
  // The mod's own band row. It shows alone when no other mod has a row (a folder that isn't a git repository hides
  // Commit & Push); otherwise the arrangement hook below takes it out and draws the button beside the other rows
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => (e.props.hasSurvey ? next(e) : continueButton($, e)))

  // The band stacks one row per mod, so a button in a row of its own would sit under Commit & Push. Wrapping the other
  // rows in a horizontal Box puts it after them, in the same line, without depending on which mod's hooks run first
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    const others = e.props.rows.filter(row => row.plugin !== PLUGIN)
    if (e.props.hasSurvey || others.length === 0) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const stacked = await next({ ...e, props: { ...e.props, rows: others } })

    // flex-start keeps the button one line tall and level with the first row while another mod's row is taller
    return (
      <Box gap={1} alignItems="flex-start">
        {stacked}
        {continueButton($, e)}
      </Box>
    )
  })
}

function continueButton($: EngineInterface, e: BandRender): RenderElement {
  const { Button } = $.ui.resolve(e)
  const isWorking = e.props.isWorking

  return <Button key="continue" label="Continue" dimColor={isWorking} onPress={() => void sendContinue($, isWorking)} />
}

/** Sends "continue" as if the person typed it. Dimmed and ignoring presses while a turn runs, as Commit & Push does. */
async function sendContinue($: EngineInterface, isWorking: boolean): Promise<void> {
  if (isSending || isWorking) {
    return
  }
  isSending = true
  try {
    await $.prompt.submit({ text: MESSAGE, asUser: true })
  } finally {
    isSending = false
  }
}
