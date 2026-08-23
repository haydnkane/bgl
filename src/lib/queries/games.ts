import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Game, GameInput, GameWithLabels } from '@/lib/types';

export const gamesKey = ['games'] as const;

type GameRow = Game & { game_labels: { label_id: string }[] | null };

/**
 * The whole library in one request. A personal collection is small, so the list is
 * cached client-side and searched/filtered/sorted in memory (see lib/filter.ts).
 */
export function useGames() {
  return useQuery({
    queryKey: gamesKey,
    queryFn: async (): Promise<GameWithLabels[]> => {
      const { data, error } = await supabase
        .from('games')
        .select('*, game_labels(label_id)')
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

async function replaceGameLabels(gameId: string, labelIds: string[]) {
  // Simplest correct approach: clear the joins for this game, then insert the new set.
  const { error: deleteError } = await supabase.from('game_labels').delete().eq('game_id', gameId);
  if (deleteError) throw deleteError;
  if (labelIds.length === 0) return;

  const { error: insertError } = await supabase
    .from('game_labels')
    .insert(labelIds.map((label_id) => ({ game_id: gameId, label_id })));
  if (insertError) throw insertError;
}

export function useAddGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, labelIds }: { input: GameInput; labelIds: string[] }) => {
      const { data, error } = await supabase.from('games').insert(input).select().single();
      if (error) throw error;
      await replaceGameLabels((data as Game).id, labelIds);
      return data as Game;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gamesKey }),
  });
}

export function useUpdateGame() {
  const queryClient = useQueryClient();
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
      const { error } = await supabase.from('games').update(input).eq('id', id);
      if (error) throw error;
      if (labelIds) await replaceGameLabels(id, labelIds);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gamesKey }),
  });
}

export function useDeleteGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('games').delete().eq('id', id);
      if (error) throw error;
    },
    // Optimistic: the row disappears immediately, and is restored if the delete fails.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: gamesKey });
      const previous = queryClient.getQueryData<GameWithLabels[]>(gamesKey);
      queryClient.setQueryData<GameWithLabels[]>(gamesKey, (old) =>
        (old ?? []).filter((game) => game.id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(gamesKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: gamesKey }),
  });
}
