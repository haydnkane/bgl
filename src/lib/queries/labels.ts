import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { gamesKey } from '@/lib/queries/games';
import { supabase } from '@/lib/supabase';
import type { Label } from '@/lib/types';

export const labelsKey = ['labels'] as const;

export function useLabels() {
  return useQuery({
    queryKey: labelsKey,
    queryFn: async (): Promise<Label[]> => {
      const { data, error } = await supabase.from('labels').select('*').order('name');
      if (error) throw error;
      return data as Label[];
    },
  });
}

export function useAddLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from('labels')
        .insert({ name: name.trim(), color })
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
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const patch: { name?: string; color?: string } = {};
      if (name !== undefined) patch.name = name.trim();
      if (color !== undefined) patch.color = color;
      const { error } = await supabase.from('labels').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labelsKey }),
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // game_labels rows cascade away, so games are simply untagged.
      const { error } = await supabase.from('labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      queryClient.invalidateQueries({ queryKey: gamesKey });
    },
  });
}
