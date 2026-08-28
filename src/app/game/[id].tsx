import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { GameForm, type GameFormValues } from '@/components/game-form';
import { GameRatings } from '@/components/game-ratings';
import { LabelChip } from '@/components/label-chip';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bggDetailToGameInput, fetchBggGame } from '@/lib/bgg';
import { confirmDestructive } from '@/lib/confirm';
import { useLibrary } from '@/lib/library';
import { useDeleteGame, useGame, useGames, useUpdateGame } from '@/lib/queries/games';
import { useLabels } from '@/lib/queries/labels';
import type { GameWithLabels, Label } from '@/lib/types';

/** "2-4 players", or nothing when the count is unknown. */
function playerLine(game: GameWithLabels): string | null {
  if (!game.min_players && !game.max_players) return null;
  const min = game.min_players ?? game.max_players;
  const max = game.max_players ?? game.min_players;
  return min === max ? `${min} player${min === 1 ? '' : 's'}` : `${min}-${max} players`;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </View>
  );
}

/**
 * What a view-only member sees. Deliberately not the form with its inputs disabled: a
 * greyed-out text box invites a fight with the app, whereas a plain page reads as finished.
 */
function ReadOnlyGame({ game, labels }: { game: GameWithLabels; labels: Label[] }) {
  const theme = useTheme();
  const cover = game.image_url ?? game.thumbnail_url;
  const gameLabels = labels.filter((label) => game.labelIds.includes(label.id));
  const players = playerLine(game);

  return (
    <>
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={[styles.cover, { borderColor: theme.border }]}
          contentFit="contain"
          transition={150}
        />
      ) : null}

      <ThemedText type="subtitle">{game.name}</ThemedText>

      <GameRatings gameId={game.id} />

      {gameLabels.length > 0 ? (
        <View style={styles.chips}>
          {gameLabels.map((label) => (
            <LabelChip key={label.id} label={label} size="sm" />
          ))}
        </View>
      ) : null}

      {game.year_published ? <Detail label="Year" value={String(game.year_published)} /> : null}
      {players ? <Detail label="Players" value={players} /> : null}
      {game.playing_time ? <Detail label="Play time" value={`${game.playing_time} min`} /> : null}
      {game.notes ? <Detail label="Notes" value={game.notes} /> : null}
    </>
  );
}

export default function GameDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { canEdit } = useLibrary();
  const { isLoading } = useGames();
  const { data: game } = useGame(id);
  const { data: labels = [] } = useLabels();
  const updateGame = useUpdateGame();
  const deleteGame = useDeleteGame();

  const [refreshed, setRefreshed] = useState<GameWithLabels | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!game) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="help-circle-outline"
          title="Game not found"
          message="It may have been deleted on another device."
        />
      </View>
    );
  }

  const save = async (values: GameFormValues) => {
    const { labelIds, ...input } = values;
    setError(null);
    setStatus(null);
    try {
      await updateGame.mutateAsync({ id: game.id, input, labelIds });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes.');
    }
  };

  const remove = () => {
    confirmDestructive(
      `Delete "${game.name}"?`,
      'This removes it from the shelf for good, for everyone on it.',
      () => {
        deleteGame.mutate(game.id);
        router.back();
      }
    );
  };

  /** Pulls fresh metadata from BGG into the form without saving it yet. */
  const refreshFromBgg = async () => {
    if (!game.bgg_id) return;
    setRefreshing(true);
    setError(null);
    setStatus(null);
    try {
      const detail = await fetchBggGame(game.bgg_id);
      setRefreshed({ ...game, ...bggDetailToGameInput(detail) } as GameWithLabels);
      setStatus('Updated from BoardGameGeek — review and save.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach BoardGameGeek.');
    } finally {
      setRefreshing(false);
    }
  };

  const initial = refreshed ?? game;

  if (!canEdit) {
    return (
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.scroll}>
        <Stack.Screen options={{ title: game.name }} />
        <ReadOnlyGame game={game} labels={labels} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: game.name }} />

      {game.bgg_id ? (
        <Button
          title={refreshing ? 'Refreshing…' : 'Refresh from BoardGameGeek'}
          variant="secondary"
          onPress={refreshFromBgg}
          loading={refreshing}
        />
      ) : null}

      {status ? (
        <ThemedText type="small" themeColor="textSecondary">
          {status}
        </ThemedText>
      ) : null}

      <GameForm
        // Remount when refreshed values arrive so the inputs pick them up.
        key={refreshed ? `refreshed-${game.updated_at}` : game.id}
        initial={initial}
        submitTitle="Save changes"
        submitting={updateGame.isPending}
        ratingSlot={<GameRatings gameId={game.id} />}
        onSubmit={save}
      />

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      <Button title="Delete game" variant="danger" onPress={remove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingBottom: Spacing.six,
  },
  cover: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  detail: {
    gap: Spacing.one,
  },
});
