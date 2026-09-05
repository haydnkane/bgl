import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { HeartToggle } from '@/components/heart-toggle';
import { LabelChip } from '@/components/label-chip';
import { StarRating } from '@/components/star-rating';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GameRating, GameWithLabels, Label } from '@/lib/types';

type Props = {
  game: GameWithLabels;
  labels: Label[];
  /** The signed-in user's own rating — the card shows theirs, not the shelf's average. */
  rating?: GameRating | null;
};

/** Builds the "2-4" player range, or null when the player count is unknown. */
function metaLine(game: GameWithLabels): string | null {
  if (!game.min_players && !game.max_players) return null;
  const min = game.min_players ?? game.max_players;
  const max = game.max_players ?? game.min_players;
  return min === max ? `${min}` : `${min}-${max}`;
}

/**
 * BGG's community average, to one decimal. Their own scale is out of ten, so it is shown
 * that way rather than rescaled onto the five stars this shelf uses for personal ratings.
 */
function bggScore(game: GameWithLabels): string | null {
  if (game.bgg_rating === null) return null;
  return game.bgg_rating.toFixed(1);
}

export function GameCard({ game, labels, rating = null }: Props) {
  const theme = useTheme();
  const gameLabels = labels.filter((label) => game.labelIds.includes(label.id));
  const meta = metaLine(game);
  const score = bggScore(game);
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

          {/* The blank space keeps the row's height when a game has neither number,
              so cards in a grid row stay aligned with each other. */}
          <View style={styles.meta}>
            <View style={styles.players}>
              {meta ? <Ionicons name="person" size={13} color={theme.textSecondary} /> : null}
              <ThemedText type="small" themeColor="textSecondary">
                {meta ?? ' '}
              </ThemedText>
            </View>
            {score ? (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                accessibilityLabel={`BoardGameGeek score ${score} out of 10`}>
                {score}
              </ThemedText>
            ) : null}
          </View>

          {rating ? (
            <View style={styles.rating}>
              {rating.stars !== null ? (
                <StarRating value={rating.stars} size={13} accessibilityName="Your rating" />
              ) : null}
              {rating.hearted ? <HeartToggle value size={14} /> : null}
            </View>
          ) : null}

          {gameLabels.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.labels}>
              {gameLabels.map((label) => (
                <LabelChip key={label.id} label={label} size="sm" />
              ))}
            </ScrollView>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: Spacing.half,
  },
  name: {
    fontWeight: '700',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  players: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    // Yields to the score rather than pushing it off the card on a narrow tile.
    flexShrink: 1,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  labels: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginTop: Spacing.half,
    paddingRight: Spacing.two,
  },
});
