import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useLibrary } from '@/lib/library';

/** Icon box (28) + label line (16) + the item's own 5px padding, with room to spare. */
const TAB_BAR_CONTENT_HEIGHT = 58;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { canEdit, canManagePeople } = useLibrary();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          // A tab item stacks a 28px icon box over the label inside 5px of padding, which
          // needs more than the stock 49px bar — the label is aligned to the top, so the
          // shortfall came off its descenders. The bar's own height is inclusive of the
          // safe-area inset it then pads away, so that has to be added back on here.
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
        },
        // Clamped to one line: without an explicit lineHeight the box is drawn too short
        // for the tails of "g" and "j".
        tabBarLabelStyle: { fontSize: 11, lineHeight: 16 },
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
      }}>
      <Tabs.Screen
        name="(library)"
        options={{
          title: 'Games',
          // The shelf carries its own title row; a header on top of it is a second one.
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="labels"
        options={{
          title: 'Labels',
          tabBarIcon: ({ color, size }) => <Ionicons name="pricetags-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add game',
          // Both screens guard themselves as well; this only keeps the toolbar honest
          // about what the signed-in role can actually reach.
          href: canEdit ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          href: canManagePeople ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
