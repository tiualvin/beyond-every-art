// An image's three states: loading, failed in place, failed beside text.

import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { StyleSheet } from 'react-native'

import type { Media } from '../../api/contract'

import { leadRatio } from '../../components/post-row'
import { fixtureMedia } from '../../fixtures/blocks'
import { PALETTES } from '../../theme/palette'
import { TEST_SITE, renderReader } from '../../test/render'
import { HtmlBody } from '../html-body'
import { ReaderImage } from '../image'

const media = fixtureMedia('a-plate')

const frameOf = () =>
  StyleSheet.flatten(screen.getByLabelText(media.alt).props.style)

const fail = () =>
  fireEvent(screen.getByTestId('reader-image'), 'error', {
    nativeEvent: { error: 'unreachable' },
  })

const plate = () => screen.queryByTestId('plate-wash')

describe('an image', () => {
  it('waits on the quiet line colour, not on the plate', async () => {
    await renderReader(<ReaderImage media={media} />)
    // The maroon wash used to be the loading state, and every screen flashed
    // it while pictures arrived.
    expect(frameOf().backgroundColor).toBe(PALETTES.light.line)
    expect(plate()).toBeNull()
  })

  it('shows the website’s plate wash where it failed, keeping its place', async () => {
    await renderReader(<ReaderImage media={media} />)
    await fail()
    expect(plate()).toBeTruthy()
    expect(screen.getByLabelText(media.alt)).toBeTruthy()
  })

  it('leaves the layout when it was a thumbnail beside text', async () => {
    await renderReader(<ReaderImage media={media} fallback="hide" />)
    await fail()
    expect(screen.queryByLabelText(media.alt)).toBeNull()
    expect(plate()).toBeNull()
  })

  it('starts again when it is handed another picture', async () => {
    // A list row reused for another article keeps its component.
    let show: (next: Media) => void = () => {}
    function Row() {
      const [shown, setShown] = useState(media)
      show = setShown
      return <ReaderImage media={shown} />
    }
    await renderReader(<Row />)
    await fail()
    expect(plate()).toBeTruthy()
    await act(() => show(fixtureMedia('another-plate')))
    expect(plate()).toBeNull()
    expect(screen.getByTestId('reader-image')).toBeTruthy()
  })

  it('starts again in a migrated article, too', async () => {
    let show: (html: string) => void = () => {}
    const img = (src: string) =>
      `<img src="https://images.invalid/${src}.jpg" alt="A plate">`
    function Body() {
      const [html, setHtml] = useState(img('first'))
      show = setHtml
      return <HtmlBody html={html} base={`${TEST_SITE}/a-post/`} />
    }
    await renderReader(<Body />)
    await fail()
    expect(plate()).toBeTruthy()
    await act(() => show(img('second')))
    expect(plate()).toBeNull()
  })

  it('drops its credit once it has failed', async () => {
    const credited = fixtureMedia('credited', { credit: 'A photographer' })
    await renderReader(<ReaderImage media={credited} />)
    expect(screen.getByText('A photographer')).toBeTruthy()
    await fail()
    expect(screen.queryByText('A photographer')).toBeNull()
  })

  it('takes its shape from the picture when the server sent no size', async () => {
    const unsized = fixtureMedia('unsized', { width: null, height: null })
    await renderReader(<ReaderImage media={unsized} />)
    const frame = () =>
      StyleSheet.flatten(screen.getByLabelText(unsized.alt).props.style)
    expect(frame().aspectRatio).toBe(3 / 2)
    await fireEvent(screen.getByTestId('reader-image'), 'load', {
      nativeEvent: { source: { width: 800, height: 1000 } },
    })
    // A portrait painting stays a portrait rather than a landscape crop.
    expect(frame().aspectRatio).toBe(0.8)
  })
})

describe('a lead image', () => {
  it('keeps its own shape between 4:5 and 16:9', () => {
    expect(leadRatio(1.5)).toBe(1.5)
    expect(leadRatio(0.5)).toBe(4 / 5)
    expect(leadRatio(3)).toBe(16 / 9)
  })
})
