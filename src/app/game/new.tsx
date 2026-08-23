import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GameForm, type GameFormValues } from '@/components/game-form';
import { SearchBar } from '@/components/search-bar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bggDetailToGameInput, fetchBggGame, searchBgg, type BggSearchResult } from '@/lib/bgg';
import { useAddGame } from '@/lib/queries/games';
import type { GameInput } from '@/lib/types';

type Mode = 'bgg' | 'manual';

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const theme = useTheme();
  const tabs: { key: Mode; label: string }[] = [
    { key: 'bgg', label: 'Search BGG' },
    { key: 'manual', label: 'Enter manually' },
  ];

  return (
    <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[styles.tab, mode === tab.key && { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small" themeColor={mode === tab.key ? 'text' : 'textSecondary'}>
            {tab.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function BggSearch({ onPick }: { onPick: (input: GameInput) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BggSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const queryIsSearchable = trimmedQuery.length >= 3;
  // Derived rather than stored, so stale hits vanish the moment the query is cleared.
  const visibleResults = queryIsSearchable ? results : [];

  // Debounced so typing a title does not spend BGG's rate limit on every keystroke.
  useEffect(() => {
    if (!queryIsSearchable) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchBgg(trimmedQuery);
        if (!cancelled) {
          setResults(found);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setError(e instanceof Error ? e.message : 'BoardGameGeek search failed.');
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery, queryIsSearchable]);

  const pick = async (result: BggSearchResult) => {
    setImportingId(result.bgg_id);
    setError(null);
    try {
      const detail = await fetchBggGame(result.bgg_id);
      onPick(bggDetailToGameInput(detail));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that game from BoardGameGeek.');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <View style={styles.section}>
      <SearchBar value={query} onChange={setQuery} placeholder="Search BoardGameGeek" />

      {searching ? <ActivityIndicator style={styles.spinner} /> : null}

      {error ? (
        <View style={[styles.notice, { borderColor: theme.border }]}>
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            You can still add the game with &quot;Enter manually&quot;.
          </ThemedText>
        </View>
      ) : null}

      {!searching && !error && queryIsSearchable && visibleResults.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No matches on BoardGameGeek.
        </ThemedText>
      ) : null}

      {visibleResults.map((result) => (
        <Pressable
          key={result.bgg_id}
          onPress={() => pick(result)}
          disabled={importingId !== null}
          style={({ pressed }) => [
            styles.result,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <View style={styles.resultText}>
            <ThemedText type="default" numberOfLines={2} style={styles.resultName}>
              {result.name}
            </ThemedText>
            {result.year_published ? (
              <ThemedText type="small" themeColor="textSecondary">
                {result.year_published}
              </ThemedText>
            ) : null}
          </View>
          {importingId === result.bgg_id ? <ActivityIndicator size="small" /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export default function NewGameScreen() {
  const theme = useTheme();
  const router = useRouter();
  const addGame = useAddGame();
  const [mode, setMode] = useState<Mode>('bgg');
  const [prefill, setPrefill] = useState<GameInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (values: GameFormValues) => {
    const { labelIds, ...input } = values;
    setError(null);
    try {
      await addGame.mutateAsync({ input, labelIds });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that game.');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      {prefill ? (
        <View
          style={[
            styles.importedBanner,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          {prefill.thumbnail_url ? (
            <Image
              source={{ uri: prefill.thumbnail_url }}
              style={styles.importedThumb}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.resultText}>
            <ThemedText type="small" themeColor="textSecondary">
              Imported from BoardGameGeek
            </ThemedText>
            <ThemedText type="small" style={styles.resultName}>
              {prefill.name}
            </ThemedText>
          </View>
          <Pressable onPress={() => setPrefill(null)} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Clear
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <ModeTabs mode={mode} onChange={setMode} />
      )}

      {!prefill && mode === 'bgg' ? (
        <BggSearch
          onPick={(input) => {
            setPrefill(input);
            setMode('manual');
          }}
        />
      ) : null}

      {prefill || mode === 'manual' ? (
        <GameForm
          // Remount so the form picks up freshly imported values.
          key={prefill?.bgg_id ?? 'blank'}
          initial={prefill ?? undefined}
          submitTitle="Add to shelf"
          submitting={addGame.isPending}
          onSubmit={submit}
        />
      ) : null}

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingBottom: Spacing.six,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    padding: Spacing.half,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
  },
  section: {
    gap: Spacing.two,
  },
  spinner: {
    marginVertical: Spacing.two,
  },
  notice: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  importedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.two,
  },
  importedThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
  },
});
