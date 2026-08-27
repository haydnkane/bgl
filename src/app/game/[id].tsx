import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { GameForm, type GameFormValues } from '@/components/game-form';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bggDetailToGameInput, fetchBggGame } from '@/lib/bgg';
import { confirmDestructive } from '@/lib/confirm';
import { useDeleteGame, useGame, useGames, useUpdateGame } from '@/lib/queries/games';
import type { GameWithLabels } from '@/lib/types';

export default function GameDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { isLoading } = useGames();
  const { data: game } = useGame(id);
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
});
