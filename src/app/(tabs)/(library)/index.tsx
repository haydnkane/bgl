import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { FilterSortBar, type HeartFilterPerson } from '@/components/filter-sort-bar';
import { GameCard } from '@/components/game-card';
import { SearchBar } from '@/components/search-bar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { columnsFor, usePersistentDensity } from '@/hooks/use-density';
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
  const [density, setDensity] = usePersistentDensity();

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

  const myName = useMemo(() => {
    const me = people.find((person) => person.user_id === userId);
    return me ? (me.display_name ?? me.username) : null;
  }, [people, userId]);

  // The viewer's own rating is what a card shows; indexRatings only keeps their stars, so
  // the heart is read from the rows.
  const myRatings = useMemo(
    () => new Map(ratingRows.filter((r) => r.user_id === userId).map((r) => [r.game_id, r])),
    [ratingRows, userId]
  );

  const columns = columnsFor(density, width);
  const expanded = density === 'expanded';

  // Tiles share the row width evenly, so a half-empty last row would stretch its few
  // tiles across the whole shelf. Blank cells hold the gaps open instead.
  const cells = useMemo(() => {
    const filled = visible.map((game) => ({ key: game.id, game }));
    const remainder = visible.length % columns;
    if (remainder === 0) return filled;
    return [
      ...filled,
      ...Array.from({ length: columns - remainder }, (_, i) => ({
        key: `filler-${i}`,
        game: null,
      })),
    ];
  }, [visible, columns]);
  const isFiltered =
    filter.search.trim().length > 0 ||
    filter.labelIds.length > 0 ||
    filter.heartedBy.length > 0 ||
    filter.minStars !== null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        key={`columns-${columns}`}
        data={cells}
        numColumns={columns}
        keyExtractor={(cell) => cell.key}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + Spacing.three }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.countRow}>
              <View style={styles.countGroup}>
                <Pressable
                  onPress={() => setDensity(expanded ? 'default' : 'expanded')}
                  hitSlop={8}
                  accessibilityLabel={expanded ? 'Show more games per row' : 'Show fewer games per row'}>
                  <Ionicons
                    name={expanded ? 'grid-outline' : 'apps-outline'}
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {games.length === 0
                    ? 'No games yet'
                    : isFiltered
                      ? `${visible.length} of ${games.length} games`
                      : `${games.length} game${games.length === 1 ? '' : 's'}`}
                </ThemedText>
              </View>

              <View style={styles.account}>
                {myName ? (
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    numberOfLines={1}
                    style={styles.accountName}>
                    {myName}
                  </ThemedText>
                ) : null}
                {/* The name beside it is a label, not a target: only the glyph signs out. */}
                <Pressable onPress={signOut} hitSlop={8} accessibilityLabel="Sign out">
                  <Ionicons name="log-out-outline" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>

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
              message="Try a different search, or clear the label, loved-by and rating filters."
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
          <View style={styles.cell}>
            {item.game ? (
              <GameCard
                game={item.game}
                labels={labels}
                rating={myRatings.get(item.game.id) ?? null}
              />
            ) : null}
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
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  countGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // Yields to the count rather than pushing it off the row.
    flexShrink: 1,
  },
  accountName: {
    flexShrink: 1,
  },
  column: {
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
