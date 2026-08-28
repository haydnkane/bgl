import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth';
import { useLibraryId } from '@/lib/library';
import { supabase } from '@/lib/supabase';
import type { GameRating } from '@/lib/types';

/** Invalidation prefix; the live key is scoped to the library id — see queries/games.ts. */
export const ratingsKey = ['game-ratings'] as const;

export const libraryRatingsKey = (libraryId: string) => [...ratingsKey, libraryId] as const;

/**
 * Every rating on the shelf, in one request.
 *
 * Ratings are read far more often than they are written — the list, the game page and the
 * hearted-by filter all want them at once — and a family collection is small, so they are
 * cached whole and indexed in memory (see lib/filter.ts) rather than queried per game.
 */
export function useGameRatings() {
  const libraryId = useLibraryId();
  return useQuery({
    queryKey: libraryRatingsKey(libraryId ?? 'no-library'),
    // Never query before a shelf is known: RLS would return [] and that would be cached.
    enabled: libraryId !== null,
    queryFn: async (): Promise<GameRating[]> => {
      const { data, error } = await supabase
        .from('game_ratings')
        .select('game_id, user_id, stars, hearted')
        .eq('library_id', libraryId!);
      if (error) throw error;
      return data as GameRating[];
    },
  });
}

/** The signed-in user's own rating of one game, or null if they have not rated it. */
export function useMyRating(gameId: string): GameRating | null {
  const userId = useUserId();
  const { data = [] } = useGameRatings();
  if (userId === null) return null;
  return data.find((r) => r.game_id === gameId && r.user_id === userId) ?? null;
}

/**
 * Writes the signed-in user's rating of one game.
 *
 * The argument is the whole opinion, not a delta: stars and heart are set together, and an
 * empty one deletes the row rather than storing "nothing to say" — matching the
 * game_ratings_not_empty constraint.
 *
 * Optimistic, because tapping a star has to light up under the finger.
 */
export function useSetRating() {
  const queryClient = useQueryClient();
  const libraryId = useLibraryId();
  const userId = useUserId();
  const key = libraryRatingsKey(libraryId ?? 'no-library');

  return useMutation({
    mutationFn: async ({
      gameId,
      stars,
      hearted,
    }: {
      gameId: string;
      stars: number | null;
      hearted: boolean;
    }) => {
      if (!libraryId || !userId) throw new Error('You are not on the shelf.');

      if (stars === null && !hearted) {
        const { error } = await supabase
          .from('game_ratings')
          .delete()
          .eq('game_id', gameId)
          .eq('user_id', userId);
        if (error) throw error;
        return;
      }

      // Upsert on the primary key: the first star someone gives a game inserts, every
      // change after that updates.
      const { error } = await supabase
        .from('game_ratings')
        .upsert(
          { game_id: gameId, user_id: userId, library_id: libraryId, stars, hearted },
          { onConflict: 'game_id,user_id' }
        );
      if (error) throw error;
    },

    onMutate: async ({ gameId, stars, hearted }) => {
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GameRating[]>(key);

      queryClient.setQueryData<GameRating[]>(key, (old) => {
        const without = (old ?? []).filter(
          (r) => !(r.game_id === gameId && r.user_id === userId)
        );
        if (stars === null && !hearted) return without;
        return [...without, { game_id: gameId, user_id: userId, stars, hearted }];
      });

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ratingsKey }),
  });
}
