// What Txt hands the platform, so a role's scaling cannot be dropped on the way.

import { render, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { Txt } from '../text'
import { HEADLINE_MAX_SCALE } from '../typography'

afterEach(() => jest.restoreAllMocks())

describe('Txt', () => {
  it('scales each role along its own Dynamic Type curve', async () => {
    await render(
      <>
        <Txt variant="display">A lead</Txt>
        <Txt>Body text</Txt>
      </>,
    )
    expect(screen.getByText('A lead').props.dynamicTypeRamp).toBe('largeTitle')
    expect(screen.getByText('Body text').props.dynamicTypeRamp).toBe('body')
  })

  it('keeps scaling on, whatever the caller passes', async () => {
    await render(<Txt allowFontScaling={false}>Still scales</Txt>)
    expect(screen.getByText('Still scales').props.allowFontScaling).toBe(true)
  })

  it('caps a headline on Android, where there is no curve to slow it', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    await render(
      <>
        <Txt variant="display">A lead</Txt>
        <Txt>Body text</Txt>
      </>,
    )
    expect(screen.getByText('A lead').props.maxFontSizeMultiplier).toBe(
      HEADLINE_MAX_SCALE,
    )
    expect(
      screen.getByText('Body text').props.maxFontSizeMultiplier,
    ).toBeUndefined()
  })

  it('leaves a headline uncapped on iOS, where its curve already slows it', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await render(<Txt variant="display">A lead</Txt>)
    expect(
      screen.getByText('A lead').props.maxFontSizeMultiplier,
    ).toBeUndefined()
  })
})
