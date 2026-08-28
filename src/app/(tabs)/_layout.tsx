import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useLibrary } from '@/lib/library';

export default function TabsLayout() {
  const theme = useTheme();
  const { canEdit, canManagePeople } = useLibrary();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
        // The label is clamped to one line, and without an explicit lineHeight that box
        // is drawn too short for descenders — the tails of "g" and "j" get shaved off.
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
