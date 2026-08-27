import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { FilterSortBar } from '@/components/filter-sort-bar';
import { GameCard } from '@/components/game-card';
import { SearchBar } from '@/components/search-bar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePersistentFilter } from '@/hooks/use-persistent-filter';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { applyFilters } from '@/lib/filter';
import { useLibrary } from '@/lib/library';
import { useGames } from '@/lib/queries/games';
import { useLabels } from '@/lib/queries/labels';

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = usePersistentFilter();

  const { name: shelfName, memberCount, loading: libraryLoading } = useLibrary();
  const { data: games = [], isLoading: gamesLoading, isRefetching, refetch, error } = useGames();
  const { data: labels = [] } = useLabels();

  // Until a shelf is known the games query has not run at all, so "no games" would be a
  // lie rather than an empty state.
  const isLoading = libraryLoading || gamesLoading;

  const visible = useMemo(() => applyFilters(games, filter), [games, filter]);

  // Two columns once there is room for two full-width cards side by side.
  const columns = width >= 900 ? 2 : 1;
  const isFiltered = filter.search.trim().length > 0 || filter.labelIds.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        key={`columns-${columns}`}
        data={visible}
        numColumns={columns}
        keyExtractor={(game) => game.id}
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Pressable
                onPress={() => router.push('/shelf')}
                accessibilityLabel="Shelf and people"
                hitSlop={8}
                style={styles.shelfButton}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {shelfName ?? 'Shelf'}
                </ThemedText>
                {memberCount > 1 ? (
                  <>
                    <Ionicons name="people" size={14} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {memberCount}
                    </ThemedText>
                  </>
                ) : null}
              </Pressable>
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
            <FilterSortBar labels={labels} state={filter} onChange={setFilter} />
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
              message="Try a different search, or clear the label filters."
            />
          ) : (
            <EmptyState
              title="Your shelf is empty"
              message="Tap + to add your first game — search BoardGameGeek or enter it by hand."
            />
          )
        }
        renderItem={({ item }) => (
          <View style={columns > 1 ? styles.cell : undefined}>
            <GameCard game={item} labels={labels} />
          </View>
        )}
      />

      <Pressable
        onPress={() => router.push('/game/new')}
        accessibilityLabel="Add game"
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.tint },
          pressed && styles.pressed,
        ]}>
        <Ionicons name="add" size={28} color={theme.tintText} />
      </Pressable>
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
    justifyContent: 'space-between',
  },
  shelfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexShrink: 1,
  },
  column: {
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
