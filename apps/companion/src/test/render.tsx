import { render } from '@testing-library/react-native'
import type { ReactElement } from 'react'

import { LinkProvider, type LinkActions } from '../reader/link-context'
import { StaticTheme } from '../theme/theme'
import type { Scheme } from '../theme/palette'

export const TEST_SITE = 'https://www.beyondeveryart.com'

/** Renders reader UI with a theme and recorded link actions. */
export async function renderReader(
  ui: ReactElement,
  { siteUrl = TEST_SITE, scheme = 'light' as Scheme } = {},
) {
  const actions = {
    siteUrl,
    openArticle: jest.fn(),
    openExternal: jest.fn(),
  } satisfies LinkActions
  const result = await render(
    <StaticTheme scheme={scheme}>
      <LinkProvider actions={actions}>{ui}</LinkProvider>
    </StaticTheme>,
  )
  return { ...result, actions }
}
