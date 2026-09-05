import { supabase } from '@/lib/supabase';
import type { GameInput } from '@/lib/types';

export type BggSearchResult = {
  bgg_id: number;
  name: string;
  year_published: number | null;
};

export type BggGameDetail = BggSearchResult & {
  image_url: string | null;
  thumbnail_url: string | null;
  min_players: number | null;
  max_players: number | null;
  playing_time: number | null;
  /** Community average out of 10, or null when nobody has voted on it. */
  bgg_rating: number | null;
  description: string | null;
};

/**
 * Calls the `bgg` edge function. supabase.functions.invoke attaches the session JWT,
 * so the proxy stays private to signed-in users.
 */
async function invokeBgg<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(
    `bgg?${query}`,
    { method: 'GET' }
  );

  if (error) {
    // Non-2xx responses carry our JSON error body; surface that instead of "Edge Function returned a non-2xx status code".
    const body = await readErrorBody(error);
    throw new Error(body ?? error.message);
  }
  if (data && 'error' in data && data.error) throw new Error(data.error);
  return data as T;
}

async function readErrorBody(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response }).context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

export async function searchBgg(query: string): Promise<BggSearchResult[]> {
  const data = await invokeBgg<{ results: BggSearchResult[] }>({ action: 'search', query });
  return data.results ?? [];
}

export async function fetchBggGame(bggId: number): Promise<BggGameDetail> {
  const data = await invokeBgg<{ game: BggGameDetail }>({ action: 'thing', id: String(bggId) });
  return data.game;
}

/** Maps a BGG detail record onto the fields we store. */
export function bggDetailToGameInput(detail: BggGameDetail): GameInput {
  return {
    name: detail.name,
    bgg_id: detail.bgg_id,
    image_url: detail.image_url,
    thumbnail_url: detail.thumbnail_url,
    year_published: detail.year_published,
    min_players: detail.min_players,
    max_players: detail.max_players,
    playing_time: detail.playing_time,
    bgg_rating: detail.bgg_rating,
  };
}
