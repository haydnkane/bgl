import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useLibraryId } from '@/lib/library';
import { supabase } from '@/lib/supabase';
import type { Game, GameInput, GameWithLabels } from '@/lib/types';

/**
 * Prefix shared by every shelf; mutations invalidate this and React Query matches the
 * scoped keys below by prefix.
 */
export const gamesKey = ['games'] as const;

/**
 * Cache keys are scoped to the shelf, so switching shelves — or signing in as someone
 * else — is a change of key rather than stale rows from the previous one. Without that,
 * the queries that run during the brief signed-out render before AuthGate redirects would
 * cache an empty RLS result and never refetch, leaving the library blank after sign-in.
 */
export const libraryGamesKey = (libraryId: string) => [...gamesKey, libraryId] as const;

type GameRow = Game & { game_labels: { label_id: string }[] | null };

/**
 * One shelf in one request. A collection is small, so the list is cached client-side and
 * searched/filtered/sorted in memory (see lib/filter.ts).
 */
export function useGames() {
  const libraryId = useLibraryId();
  return useQuery({
    queryKey: libraryGamesKey(libraryId ?? 'no-library'),
    // Never query before a shelf is known: RLS would return [] and that would be cached.
    enabled: libraryId !== null,
    queryFn: async (): Promise<GameWithLabels[]> => {
      const { data, error } = await supabase
        .from('games')
        .select('*, game_labels(label_id)')
        .eq('library_id', libraryId!)
        .order('name');
      if (error) throw error;
      return (data as GameRow[]).map(({ game_labels, ...game }) => ({
        ...game,
        labelIds: (game_labels ?? []).map((l) => l.label_id),
      }));
    },
  });
}

export function useGame(id: string | undefined) {
  const { data, ...rest } = useGames();
  return { ...rest, data: data?.find((game) => game.id === id) };
}

async function replaceGameLabels(gameId: string, labelIds: string[], libraryId: string) {
  // Simplest correct approach: clear the joins for this game, then insert the new set.
  const { error: deleteError } = await supabase.from('game_labels').delete().eq('game_id', gameId);
  if (deleteError) throw deleteError;
  if (labelIds.length === 0) return;

  const { error: insertError } = await supabase
    .from('game_labels')
    .insert(labelIds.map((label_id) => ({ game_id: gameId, label_id, library_id: libraryId })));
  if (insertError) throw insertError;
}

export function useAddGame() {
  const queryClient = useQueryClient();
  const libraryId = useLibraryId();
  return useMutation({
    mutationFn: async ({ input, labelIds }: { input: GameInput; labelIds: string[] }) => {
      if (!libraryId) throw new Error('You are not on the shelf.');
      const { data, error } = await supabase
        .from('games')
        .insert({ ...input, library_id: libraryId })
        .select()
        .single();
      if (error) throw error;
      await replaceGameLabels((data as Game).id, labelIds, libraryId);
      return data as Game;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gamesKey }),
  });
}

export function useUpdateGame() {
  const queryClient = useQueryClient();
  const libraryId = useLibraryId();
  return useMutation({
    mutationFn: async ({
      id,
      input,
      labelIds,
    }: {
      id: string;
      input: GameInput;
      labelIds?: string[];
    }) => {
      if (!libraryId) throw new Error('You are not on the shelf.');
      const { error } = await supabase
        .from('games')
        .update(input)
        .eq('id', id)
        .eq('library_id', libraryId);
      if (error) throw error;
      if (labelIds) await replaceGameLabels(id, labelIds, libraryId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gamesKey }),
  });
}

export function useDeleteGame() {
  const queryClient = useQueryClient();
  const libraryId = useLibraryId();
  // The optimistic update writes to one cache entry, so it needs the scoped key.
  const key = libraryGamesKey(libraryId ?? 'no-library');
  return useMutation({
    mutationFn: async (id: string) => {
      if (!libraryId) throw new Error('You are not on the shelf.');
      const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', id)
        .eq('library_id', libraryId);
      if (error) throw error;
    },
    // Optimistic: the row disappears immediately, and is restored if the delete fails.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GameWithLabels[]>(key);
      queryClient.setQueryData<GameWithLabels[]>(key, (old) =>
        (old ?? []).filter((game) => game.id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: gamesKey }),
  });
}
