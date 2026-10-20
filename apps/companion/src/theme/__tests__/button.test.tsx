// How a control answers a press on each platform.

import { fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'

import { Chip } from '../../screens/read'
import { Button } from '../button'
import { CAPSULE } from '../typography'

// The native commands Android's ripple sends to its view, absent under Jest.
jest.mock('react-native/Libraries/Components/View/ViewNativeComponent', () => ({
  ...jest.requireActual(
    'react-native/Libraries/Components/View/ViewNativeComponent',
  ),
  Commands: { hotspotUpdate: jest.fn(), setPressed: jest.fn() },
}))

afterEach(() => jest.restoreAllMocks())

const controls = [
  ['a button', () => <Button label="Go" onPress={() => {}} />, 'button'],
  ['a chip', () => <Chip label="Go" onPress={() => {}} />, 'link'],
] as const

describe.each(controls)('%s', (_, Control, role) => {
  const pressable = () => screen.getByRole(role)
  const opacityWhilePressed = async () => {
    await fireEvent(pressable(), 'responderGrant', {
      nativeEvent: { timestamp: 0, touches: [], changedTouches: [] },
      persist: () => {},
      currentTarget: { measure: () => {} },
    })
    return StyleSheet.flatten(pressable().props.style).opacity
  }

  it('is clipped to its capsule by a parent, so Android’s ripple is too', async () => {
    // Android draws the ripple to the pressable's own rectangle.
    await render(<Control />)
    const clip = StyleSheet.flatten(pressable().parent!.props.style)
    expect(clip).toMatchObject({ borderRadius: CAPSULE, overflow: 'hidden' })
  })

  it('ripples on Android without also dimming', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    await render(<Control />)
    expect(await opacityWhilePressed()).toBeUndefined()
  })

  it('dims on iOS, which has no ripple', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await render(<Control />)
    expect(await opacityWhilePressed()).toBe(0.7)
  })
})
