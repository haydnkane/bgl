import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  name: string;
  selected: boolean;
  onPress: () => void;
};

/** Library filter: "show me the games <name> loves". Sits next to the label chips. */
export function UserHeartChip({ name, selected, onPress }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Games ${name} loves`}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.heart : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={selected ? 'heart' : 'heart-outline'}
        size={14}
        color={selected ? theme.heart : theme.textSecondary}
      />
      <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
        {name}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
