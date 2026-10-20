// A simple palette builder: on the device, seeded from the brand.

import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Screen } from '../components/screen'
import { EmptyState, ErrorState, Loading } from '../components/states'
import { useDeletePalette, usePalettes, useSavePalette } from '../data/hooks'
import type { Palette } from '../library/types'
import { MAX_PALETTE_COLOURS, MAX_PALETTE_NAME } from '../library/validate'
import { Button } from '../theme/button'
import { familyFor } from '../theme/fonts'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { CAPSULE, MIN_TOUCH, space } from '../theme/typography'
import { STARTER_PALETTE, STUDIO_COLOURS, nameOf } from './colours'

type Draft = { id?: string; name: string; colours: string[] }

export function Swatch({
  hex,
  label,
  onPress,
  hint,
}: {
  hex: string
  label: string
  onPress?: () => void
  hint?: string
}) {
  const { palette } = useTheme()
  const swatch = (
    <View
      style={[
        styles.swatch,
        { backgroundColor: hex, borderColor: palette.rule },
      ]}
    />
  )
  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label}>
        {swatch}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.swatchButton, pressed && styles.pressed]}
    >
      {swatch}
    </Pressable>
  )
}

function Editor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const { palette } = useTheme()
  const save = useSavePalette()
  const [name, setName] = useState(draft.name)
  const [colours, setColours] = useState(draft.colours)
  const [hex, setHex] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const full = colours.length >= MAX_PALETTE_COLOURS

  const add = (colour: string) => {
    if (full) {
      setProblem(`A palette holds up to ${MAX_PALETTE_COLOURS} colours.`)
      return
    }
    setProblem(null)
    setColours((current) => [...current, colour.toLowerCase()])
  }

  const addHex = () => {
    const value = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      setProblem('Enter a colour as six hex digits, like #6D1F2C.')
      return
    }
    add(value)
    setHex('')
  }

  const submit = () => {
    if (!name.trim()) return setProblem('Give the palette a name.')
    if (colours.length === 0) return setProblem('Add at least one colour.')
    save.mutate(
      { id: draft.id, name, colours },
      {
        onSuccess: onDone,
        onError: () => setProblem('The palette could not be saved.'),
      },
    )
  }

  const inputStyle = [
    styles.input,
    {
      color: palette.text,
      borderColor: palette.field,
      backgroundColor: palette.surface,
    },
  ]

  return (
    <View style={styles.editor}>
      <Txt variant="h3" accessibilityRole="header">
        {draft.id ? 'Edit palette' : 'New palette'}
      </Txt>
      <TextInput
        accessibilityLabel="Palette name"
        placeholder="Palette name"
        placeholderTextColor={palette.muted}
        value={name}
        onChangeText={setName}
        maxLength={MAX_PALETTE_NAME}
        style={inputStyle}
      />
      <Txt variant="label">In this palette</Txt>
      {colours.length === 0 ? (
        <Txt tone="muted">No colours yet.</Txt>
      ) : (
        <View style={styles.swatches}>
          {colours.map((colour, index) => (
            <Swatch
              key={`${colour}-${index}`}
              hex={colour}
              label={`Remove ${nameOf(colour)}`}
              onPress={() =>
                setColours((current) => current.filter((_, at) => at !== index))
              }
            />
          ))}
        </View>
      )}
      <Txt variant="label">Add from the brand palette</Txt>
      <View style={styles.swatches}>
        {STUDIO_COLOURS.map((colour) => (
          <Swatch
            key={colour.hex}
            hex={colour.hex}
            label={`Add ${colour.name}`}
            onPress={() => add(colour.hex)}
          />
        ))}
      </View>
      <View style={styles.hexRow}>
        <TextInput
          accessibilityLabel="Hex colour"
          placeholder="#6D1F2C"
          placeholderTextColor={palette.muted}
          value={hex}
          onChangeText={setHex}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={[inputStyle, styles.flex]}
        />
        <Button label="Add colour" variant="secondary" onPress={addHex} />
      </View>
      {problem ? (
        <Txt
          tone="accent"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {problem}
        </Txt>
      ) : null}
      <View style={styles.actions}>
        <Button label="Save palette" onPress={submit} />
        <Button label="Cancel" variant="secondary" onPress={onDone} />
      </View>
    </View>
  )
}

function PaletteRow({ item, onEdit }: { item: Palette; onEdit: () => void }) {
  const { palette } = useTheme()
  const remove = useDeletePalette()
  return (
    <View style={[styles.paletteRow, { borderColor: palette.line }]}>
      <Txt variant="label">{item.name}</Txt>
      <View style={styles.swatches}>
        {item.colours.map((colour, index) => (
          <Swatch
            key={`${colour}-${index}`}
            hex={colour}
            label={nameOf(colour)}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Button
          label="Edit"
          variant="secondary"
          accessibilityLabel={`Edit ${item.name}`}
          onPress={onEdit}
        />
        <Button
          label="Delete"
          variant="secondary"
          accessibilityLabel={`Delete ${item.name}`}
          onPress={() => remove.mutate(item.id)}
        />
      </View>
    </View>
  )
}

export function StudioScreen() {
  const palettes = usePalettes()
  const [draft, setDraft] = useState<Draft | null>(null)

  return (
    <Screen>
      {draft ? (
        <Editor draft={draft} onDone={() => setDraft(null)} />
      ) : (
        <>
          <Txt tone="muted">
            Build palettes from the colours of the Beyond Every Art palette or
            your own. They are kept on this device.
          </Txt>
          <Button
            label="New palette"
            onPress={() => setDraft({ name: '', colours: STARTER_PALETTE })}
            style={styles.start}
          />
          {palettes.isPending ? (
            <Loading label="Loading palettes" />
          ) : palettes.isError ? (
            <ErrorState error={palettes.error} />
          ) : palettes.data.length === 0 ? (
            <EmptyState
              title="No palettes yet"
              body="A new palette starts from the brand’s paper, ink and burgundy, with two pigments."
            />
          ) : (
            palettes.data.map((item) => (
              <PaletteRow
                key={item.id}
                item={item}
                onEdit={() =>
                  setDraft({
                    id: item.id,
                    name: item.name,
                    colours: item.colours,
                  })
                }
              />
            ))
          )}
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  editor: { gap: space.md },
  input: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md + space.xs,
    borderWidth: 1,
    borderRadius: CAPSULE,
    fontFamily: familyFor('sans'),
    fontSize: 17,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatchButton: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH },
  swatch: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hexRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  paletteRow: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.7 },
})
