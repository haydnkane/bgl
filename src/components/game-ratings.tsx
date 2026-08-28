import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HeartToggle } from '@/components/heart-toggle';
import { StarRating } from '@/components/star-rating';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserId } from '@/lib/auth';
import { useShelfPeople } from '@/lib/queries/libraries';
import { useGameRatings, useSetRating } from '@/lib/queries/ratings';
import type { GameRating } from '@/lib/types';

/** One other person's opinion, read-only: their name, their stars, their heart if any. */
function PersonRating({ name, rating }: { name: string; rating: GameRating }) {
  const theme = useTheme();

  return (
    <View
      style={[styles.pill, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" numberOfLines={1} style={styles.pillName}>
        {name}
      </ThemedText>
      {rating.stars !== null ? (
        <StarRating value={rating.stars} size={13} accessibilityName={`${name}'s rating`} />
      ) : null}
      {rating.hearted ? <HeartToggle value size={14} accessibilityName={name} /> : null}
    </View>
  );
}

/**
 * Stars and a heart for the signed-in user, and everyone else's underneath.
 *
 * Rating is the one thing every role may do, view-only included, so this renders the same
 * on the editable page and the read-only one. Each tap saves on its own — there is no
 * form around it to submit.
 */
export function GameRatings({ gameId }: { gameId: string }) {
  const theme = useTheme();
  const userId = useUserId();
  const { data: ratings = [] } = useGameRatings();
  const { data: people = [] } = useShelfPeople();
  const setRating = useSetRating();
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => {
    const byId = new Map<string, string>();
    for (const person of people) {
      if (person.user_id) byId.set(person.user_id, person.display_name ?? person.username);
    }
    return byId;
  }, [people]);

  const { mine, others } = useMemo(() => {
    const forGame = ratings.filter((rating) => rating.game_id === gameId);
    return {
      mine: forGame.find((rating) => rating.user_id === userId) ?? null,
      others: forGame
        .filter((rating) => rating.user_id !== userId)
        .sort((a, b) =>
          (names.get(a.user_id) ?? '').localeCompare(names.get(b.user_id) ?? '')
        ),
    };
  }, [ratings, gameId, userId, names]);

  const stars = mine?.stars ?? null;
  const hearted = mine?.hearted ?? false;

  // Stars and heart are stored together, so changing one always resends the other.
  const save = (next: { stars: number | null; hearted: boolean }) => {
    setError(null);
    setRating.mutate(
      { gameId, ...next },
      { onError: (e) => setError(e instanceof Error ? e.message : 'Could not save your rating.') }
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.mine}>
        <StarRating
          value={stars}
          onChange={(value) => save({ stars: value, hearted })}
          accessibilityName="Your rating"
        />
        <HeartToggle value={hearted} onChange={(value) => save({ stars, hearted: value })} />
      </View>

      {others.length > 0 ? (
        <View style={styles.others}>
          {others.map((rating) => (
            <PersonRating
              key={rating.user_id}
              name={names.get(rating.user_id) ?? 'Someone'}
              rating={rating}
            />
          ))}
        </View>
      ) : null}

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  mine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  others: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  pillName: {
    fontWeight: '600',
  },
});
