import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { LabelPicker } from '@/components/label-picker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GameInput, GameWithLabels } from '@/lib/types';

export type GameFormValues = GameInput & { labelIds: string[] };

type Props = {
  initial?: Partial<GameWithLabels> & { labelIds?: string[] };
  submitTitle: string;
  submitting?: boolean;
  /**
   * Rendered directly under the name. The game page puts the star rating here, so it reads
   * as part of the game rather than part of the form — which it is: stars save on tap,
   * and nothing below them does.
   */
  ratingSlot?: ReactNode;
  onSubmit: (values: GameFormValues) => void;
};

/** Parses a numeric field, treating blank as "unknown" rather than zero. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function GameForm({
  initial,
  submitTitle,
  submitting = false,
  ratingSlot,
  onSubmit,
}: Props) {
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [year, setYear] = useState(toText(initial?.year_published));
  const [minPlayers, setMinPlayers] = useState(toText(initial?.min_players));
  const [maxPlayers, setMaxPlayers] = useState(toText(initial?.max_players));
  const [playingTime, setPlayingTime] = useState(toText(initial?.playing_time));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(initial?.labelIds ?? []);
  const [error, setError] = useState<string | null>(null);

  // Artwork comes from BoardGameGeek and is not worth a text box: it is shown, and carried
  // through untouched on save. "Refresh from BoardGameGeek" is how a picture changes.
  const cover = initial?.image_url ?? null;

  const submit = () => {
    if (!name.trim()) {
      setError('A name is required.');
      return;
    }
    setError(null);

    onSubmit({
      name: name.trim(),
      // Preserve the BGG link and artwork when editing an imported game.
      bgg_id: initial?.bgg_id ?? null,
      image_url: cover,
      thumbnail_url: initial?.thumbnail_url ?? null,
      year_published: toNumber(year),
      min_players: toNumber(minPlayers),
      max_players: toNumber(maxPlayers),
      playing_time: toNumber(playingTime),
      notes: notes.trim() || null,
      labelIds,
    });
  };

  return (
    <View style={styles.container}>
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={[styles.preview, { borderColor: theme.border }]}
          contentFit="contain"
          transition={150}
        />
      ) : null}

      <Field label="Name" value={name} onChangeText={setName} placeholder="Gloomhaven" />

      {ratingSlot}

      <View style={styles.row}>
        <Field
          label="Year"
          value={year}
          onChangeText={setYear}
          keyboardType="number-pad"
          containerStyle={styles.flex}
        />
        <Field
          label="Play time (min)"
          value={playingTime}
          onChangeText={setPlayingTime}
          keyboardType="number-pad"
          containerStyle={styles.flex}
        />
      </View>

      <View style={styles.row}>
        <Field
          label="Min players"
          value={minPlayers}
          onChangeText={setMinPlayers}
          keyboardType="number-pad"
          containerStyle={styles.flex}
        />
        <Field
          label="Max players"
          value={maxPlayers}
          onChangeText={setMaxPlayers}
          keyboardType="number-pad"
          containerStyle={styles.flex}
        />
      </View>

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Expansions owned, house rules, who it plays well with…"
        multiline
        style={styles.notes}
      />

      <LabelPicker selectedIds={labelIds} onChange={setLabelIds} />

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      <Button title={submitTitle} onPress={submit} loading={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  notes: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
});
