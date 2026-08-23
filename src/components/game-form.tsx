import { Image } from 'expo-image';
import { useState } from 'react';
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

export function GameForm({ initial, submitTitle, submitting = false, onSubmit }: Props) {
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [year, setYear] = useState(toText(initial?.year_published));
  const [minPlayers, setMinPlayers] = useState(toText(initial?.min_players));
  const [maxPlayers, setMaxPlayers] = useState(toText(initial?.max_players));
  const [playingTime, setPlayingTime] = useState(toText(initial?.playing_time));
  const [rating, setRating] = useState(toText(initial?.rating));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(initial?.labelIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) {
      setError('A name is required.');
      return;
    }
    const ratingValue = toNumber(rating);
    if (ratingValue !== null && (ratingValue < 1 || ratingValue > 10)) {
      setError('Rating must be between 1 and 10.');
      return;
    }
    setError(null);

    onSubmit({
      name: name.trim(),
      // Preserve the BGG link when editing an imported game.
      bgg_id: initial?.bgg_id ?? null,
      image_url: imageUrl.trim() || null,
      // Keep the BGG thumbnail only while the full image URL is unchanged.
      thumbnail_url: imageUrl.trim() === (initial?.image_url ?? '') ? initial?.thumbnail_url ?? null : null,
      year_published: toNumber(year),
      min_players: toNumber(minPlayers),
      max_players: toNumber(maxPlayers),
      playing_time: toNumber(playingTime),
      rating: ratingValue,
      notes: notes.trim() || null,
      labelIds,
    });
  };

  return (
    <View style={styles.container}>
      {imageUrl.trim() ? (
        <Image
          source={{ uri: imageUrl.trim() }}
          style={[styles.preview, { borderColor: theme.border }]}
          contentFit="contain"
          transition={150}
        />
      ) : null}

      <Field label="Name" value={name} onChangeText={setName} placeholder="Gloomhaven" />
      <Field
        label="Image URL"
        value={imageUrl}
        onChangeText={setImageUrl}
        placeholder="https://…"
        autoCapitalize="none"
        autoCorrect={false}
        hint="Filled in automatically when you import from BoardGameGeek."
      />

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
        label="My rating (1-10)"
        value={rating}
        onChangeText={setRating}
        keyboardType="number-pad"
      />

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
