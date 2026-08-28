import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { FilterSortBar, type HeartFilterPerson } from '@/components/filter-sort-bar';
import { GameCard } from '@/components/game-card';
import { SearchBar } from '@/components/search-bar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import { useTheme } from '@/hooks/use-theme';
import { signOut, useUserId } from '@/lib/auth';
import { applyFilters, indexRatings } from '@/lib/filter';
import { useLibrary } from '@/lib/library';
import { useGames } from '@/lib/queries/games';
import { useLabels } from '@/lib/queries/labels';
import { useShelfPeople } from '@/lib/queries/libraries';
import { useGameRatings } from '@/lib/queries/ratings';

export default function LibraryScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // This screen has no header, so the status bar is ours to clear.
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const [filter, setFilter] = usePersistentFilter();

  const { loading: libraryLoading, canEdit } = useLibrary();
  const { data: games = [], isLoading: gamesLoading, isRefetching, refetch, error } = useGames();
  const { data: labels = [] } = useLabels();
  const { data: ratingRows = [] } = useGameRatings();
  const { data: people = [] } = useShelfPeople();

  // Until membership is known the games query has not run at all, so "no games" would be a
  // lie rather than an empty state.
  const isLoading = libraryLoading || gamesLoading;

  const ratings = useMemo(() => indexRatings(ratingRows, userId), [ratingRows, userId]);
  const visible = useMemo(() => applyFilters(games, filter, ratings), [games, filter, ratings]);

  // Only people who have signed in can have hearted anything, so an allowlist entry that
  // has never been claimed gets no pill. Your own comes first — it is the one you reach for.
  const heartPeople = useMemo<HeartFilterPerson[]>(
    () =>
      people
        .filter((person) => person.user_id !== null)
        .map((person) => ({
          userId: person.user_id!,
          name: person.display_name ?? person.username,
        }))
        .sort((a, b) =>
          a.userId === userId ? -1 : b.userId === userId ? 1 : a.name.localeCompare(b.name)
        ),
    [people, userId]
  );

  // The viewer's own rating is what a card shows; indexRatings only keeps their stars, so
  // the heart is read from the rows.
  const myRatings = useMemo(
    () => new Map(ratingRows.filter((r) => r.user_id === userId).map((r) => [r.game_id, r])),
    [ratingRows, userId]
  );

  // Two columns once there is room for two full-width cards side by side.
  const columns = width >= 900 ? 2 : 1;
  const isFiltered =
    filter.search.trim().length > 0 ||
    filter.labelIds.length > 0 ||
    filter.heartedBy.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        key={`columns-${columns}`}
        data={visible}
        numColumns={columns}
        keyExtractor={(game) => game.id}
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + Spacing.three }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Pressable onPress={signOut} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">
                  Sign out
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText type="smallBold" themeColor="textSecondary">
              {games.length === 0
                ? 'No games yet'
                : isFiltered
                  ? `${visible.length} of ${games.length} games`
                  : `${games.length} game${games.length === 1 ? '' : 's'}`}
            </ThemedText>

            <SearchBar value={filter.search} onChange={(search) => setFilter({ ...filter, search })} />
            <FilterSortBar
              labels={labels}
              people={heartPeople}
              state={filter}
              onChange={setFilter}
            />
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : error ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Could not load your library"
              message={error instanceof Error ? error.message : 'Pull down to try again.'}
            />
          ) : isFiltered ? (
            <EmptyState
              icon="search-outline"
              title="Nothing matches"
              message="Try a different search, or clear the label and loved-by filters."
            />
          ) : (
            <EmptyState
              title="Your shelf is empty"
              message={
                canEdit
                  ? 'Use Add game in the toolbar below — search BoardGameGeek or enter it by hand.'
                  : 'Nothing has been added yet. Ask someone who can edit the collection.'
              }
            />
          )
        }
        renderItem={({ item }) => (
          <View style={columns > 1 ? styles.cell : undefined}>
            <GameCard game={item} labels={labels} rating={myRatings.get(item.id) ?? null} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth * 1.5,
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  column: {
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
