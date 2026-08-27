import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useActiveLibraryId } from '@/lib/library';
import { gamesKey } from '@/lib/queries/games';
import { supabase } from '@/lib/supabase';
import type { Label } from '@/lib/types';

/** Invalidation prefix; the live key is scoped to the shelf — see queries/games.ts. */
export const labelsKey = ['labels'] as const;

export const libraryLabelsKey = (libraryId: string) => [...labelsKey, libraryId] as const;

export function useLabels() {
  const libraryId = useActiveLibraryId();
  return useQuery({
    queryKey: libraryLabelsKey(libraryId ?? 'no-library'),
    // Never query before a shelf is known: RLS would return [] and that would be cached.
    enabled: libraryId !== null,
    queryFn: async (): Promise<Label[]> => {
      const { data, error } = await supabase
        .from('labels')
        .select('*')
        .eq('library_id', libraryId!)
        .order('name');
      if (error) throw error;
      return data as Label[];
    },
  });
}

export function useAddLabel() {
  const queryClient = useQueryClient();
  const libraryId = useActiveLibraryId();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!libraryId) throw new Error('No shelf selected.');
      const { data, error } = await supabase
        .from('labels')
        .insert({ name: name.trim(), color, library_id: libraryId })
        .select()
        .single();
      if (error) throw error;
      return data as Label;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labelsKey }),
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();
  const libraryId = useActiveLibraryId();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const patch: { name?: string; color?: string } = {};
      if (name !== undefined) patch.name = name.trim();
      if (color !== undefined) patch.color = color;
      const { error } = await supabase
        .from('labels')
        .update(patch)
        .eq('id', id)
        .eq('library_id', libraryId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labelsKey }),
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  const libraryId = useActiveLibraryId();
  return useMutation({
    mutationFn: async (id: string) => {
      // game_labels rows cascade away, so games are simply untagged.
      const { error } = await supabase
        .from('labels')
        .delete()
        .eq('id', id)
        .eq('library_id', libraryId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      queryClient.invalidateQueries({ queryKey: gamesKey });
    },
  });
}
