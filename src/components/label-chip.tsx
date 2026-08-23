import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import type { Label } from '@/lib/types';

type Props = {
  label: Pick<Label, 'name' | 'color'>;
  selected?: boolean;
  size?: 'sm' | 'md';
  onPress?: () => void;
};

export function LabelChip({ label, selected = false, size = 'md', onPress }: Props) {
  const body = (
    <View
      style={[
        styles.chip,
        size === 'sm' && styles.chipSmall,
        { borderColor: label.color, backgroundColor: selected ? label.color : 'transparent' },
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          size === 'sm' && styles.textSmall,
          { color: selected ? '#ffffff' : label.color },
        ]}>
        {label.name}
      </Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  chipSmall: {
    paddingVertical: 1,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
  textSmall: {
    fontSize: 11,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.6,
  },
});
