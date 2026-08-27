import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { LabelChip } from '@/components/label-chip';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GameWithLabels, Label } from '@/lib/types';

type Props = {
  game: GameWithLabels;
  labels: Label[];
};

/** Builds the "2-4" player range, or null when the player count is unknown. */
function metaLine(game: GameWithLabels): string | null {
  if (!game.min_players && !game.max_players) return null;
  const min = game.min_players ?? game.max_players;
  const max = game.max_players ?? game.min_players;
  return min === max ? `${min}` : `${min}-${max}`;
}

export function GameCard({ game, labels }: Props) {
  const theme = useTheme();
  const gameLabels = labels.filter((label) => game.labelIds.includes(label.id));
  const meta = metaLine(game);
  const cover = game.thumbnail_url ?? game.image_url;

  return (
    <Link href={{ pathname: '/game/[id]', params: { id: game.id } }} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          pressed && styles.pressed,
        ]}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.cover, styles.coverFallback, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="subtitle" themeColor="textSecondary">
              {game.name.slice(0, 1).toUpperCase()}
            </ThemedText>
          </View>
        )}

        <View style={styles.body}>
          <ThemedText type="default" numberOfLines={2} style={styles.name}>
            {game.name}
          </ThemedText>

          <View style={styles.meta}>
            {meta ? <Ionicons name="person" size={13} color={theme.textSecondary} /> : null}
            <ThemedText type="small" themeColor="textSecondary">
              {meta ?? ' '}
            </ThemedText>
          </View>

          {game.rating ? (
            <ThemedText type="small" themeColor="textSecondary">
              {'★'.repeat(Math.round(game.rating / 2)).padEnd(5, '☆')} {game.rating}/10
            </ThemedText>
          ) : null}

          {gameLabels.length ? (
            <View style={styles.labels}>
              {gameLabels.map((label) => (
                <LabelChip key={label.id} label={label} size="sm" />
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  cover: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.half,
  },
  name: {
    fontWeight: '700',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.half,
  },
});
