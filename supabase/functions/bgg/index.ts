// BoardGameGeek proxy.
//
// Two reasons this exists rather than the app calling BGG directly:
//   1. BGG's XML API now requires a registered bearer token, which must not ship in a
//      web bundle. It lives here as the BGG_TOKEN function secret.
//   2. BGG sends no CORS headers, so a browser cannot call it at all.
//
// It also converts XML to JSON so the client never parses markup.
//
// Deploy:  npx supabase secrets set BGG_TOKEN=...
//          npx supabase functions deploy bgg

import { XMLParser } from 'npm:fast-xml-parser@4.5.0';

const BGG_BASE = 'https://boardgamegeek.com/xmlapi2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // BGG returns a bare element for a single result and a list for many; force lists
  // so downstream code has one shape to handle.
  isArray: (name) => name === 'item' || name === 'name',
});

type BggSearchResult = {
  bgg_id: number;
  name: string;
  year_published: number | null;
};

type BggGameDetail = BggSearchResult & {
  image_url: string | null;
  thumbnail_url: string | null;
  min_players: number | null;
  max_players: number | null;
  playing_time: number | null;
  description: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * BGG double-encodes its text: the XML itself carries `&amp;#039;`, so the parser's own
 * entity pass leaves a literal `&#039;` behind. Undo that second layer.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (match, code) => fromCodePoint(Number(code), match))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => fromCodePoint(parseInt(code, 16), match))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // Last, so decoding a reference never manufactures a fresh entity out of its neighbours.
    .replace(/&amp;/g, '&');
}

/** Leaves malformed references (out of range, lone surrogates) as written. */
function fromCodePoint(code: number, original: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return original;
  if (code >= 0xd800 && code <= 0xdfff) return original;
  return String.fromCodePoint(code);
}

/** Reads `value="123"` style attributes, which BGG uses for nearly every scalar. */
function attrNumber(node: unknown): number | null {
  const raw = (node as { '@_value'?: string })?.['@_value'];
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function attrText(node: unknown): string | null {
  return (node as { '@_value'?: string })?.['@_value'] ?? null;
}

function decodeOptional(value: string | null): string | null {
  return value === null ? null : decodeEntities(value);
}

/** Picks the primary title; BGG lists alternate-language names alongside it. */
function primaryName(item: Record<string, unknown>): string {
  const names = (item.name ?? []) as { '@_type'?: string; '@_value'?: string }[];
  const primary = names.find((n) => n['@_type'] === 'primary') ?? names[0];
  const value = primary?.['@_value'];
  return value ? decodeEntities(value) : 'Unknown';
}

async function callBgg(path: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${BGG_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/xml',
      'User-Agent': 'boardgame-shelf (personal collection tracker)',
    },
  });

  if (response.status === 429) {
    throw new HttpError(429, 'BoardGameGeek is rate limiting requests. Wait a moment and try again.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(502, 'BoardGameGeek rejected the API token. Check the BGG_TOKEN secret.');
  }
  if (!response.ok) {
    throw new HttpError(502, `BoardGameGeek returned ${response.status}.`);
  }

  return parser.parse(await response.text());
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function search(query: string, token: string): Promise<BggSearchResult[]> {
  const parsed = await callBgg(
    `/search?type=boardgame&query=${encodeURIComponent(query)}`,
    token
  );
  const items = ((parsed.items as Record<string, unknown>)?.item ?? []) as Record<string, unknown>[];
  return items.map((item) => ({
    bgg_id: Number(item['@_id']),
    name: primaryName(item),
    year_published: attrNumber(item.yearpublished),
  }));
}

async function thing(id: string, token: string): Promise<BggGameDetail> {
  const parsed = await callBgg(`/thing?id=${encodeURIComponent(id)}&stats=1`, token);
  const items = ((parsed.items as Record<string, unknown>)?.item ?? []) as Record<string, unknown>[];
  const item = items[0];
  if (!item) throw new HttpError(404, `No BoardGameGeek entry found for id ${id}.`);

  const image = typeof item.image === 'string' ? item.image : null;
  const thumbnail = typeof item.thumbnail === 'string' ? item.thumbnail : null;

  return {
    bgg_id: Number(item['@_id']),
    name: primaryName(item),
    year_published: attrNumber(item.yearpublished),
    image_url: image,
    thumbnail_url: thumbnail,
    min_players: attrNumber(item.minplayers),
    max_players: attrNumber(item.maxplayers),
    playing_time: attrNumber(item.playingtime),
    description: decodeOptional(
      typeof item.description === 'string' ? item.description : attrText(item.description)
    ),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const token = Deno.env.get('BGG_TOKEN');
  if (!token) {
    return json(
      { error: 'BGG_TOKEN is not configured. Add your BoardGameGeek API token to use search.' },
      503
    );
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'search') {
      const query = url.searchParams.get('query')?.trim();
      if (!query) return json({ error: 'Missing "query" parameter.' }, 400);
      return json({ results: await search(query, token) });
    }

    if (action === 'thing') {
      const id = url.searchParams.get('id')?.trim();
      if (!id) return json({ error: 'Missing "id" parameter.' }, 400);
      return json({ game: await thing(id, token) });
    }

    return json({ error: 'Unknown action. Use ?action=search or ?action=thing.' }, 400);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500);
  }
});
