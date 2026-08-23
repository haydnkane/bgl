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

/** Builds the "2-4 players · 90 min" line, skipping anything we don't know. */
function metaLine(game: GameWithLabels): string | null {
  const parts: string[] = [];
  if (game.min_players || game.max_players) {
    const min = game.min_players ?? game.max_players;
    const max = game.max_players ?? game.min_players;
    parts.push(min === max ? `${min} player${min === 1 ? '' : 's'}` : `${min}-${max} players`);
  }
  if (game.playing_time) parts.push(`${game.playing_time} min`);
  return parts.length ? parts.join(' · ') : null;
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

          <ThemedText type="small" themeColor="textSecondary">
            {[game.year_published, meta].filter(Boolean).join(' · ') || ' '}
          </ThemedText>

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
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.half,
  },
});
