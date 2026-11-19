import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, IconButton, Sheet, Text, AnimatedNumber, Segmented } from '@/ui';
import { useTheme } from '@/theme/ThemeProvider';

/** Touch-friendly time picker in a bottom sheet (no native date-picker dependency). value = "HH:MM". */
export function TimeSheet({ visible, value, title = 'Choose a time', onClose, onSave }: {
  visible: boolean; value: string; title?: string; onClose: () => void; onSave: (hhmm: string) => void;
}) {
  const t = useTheme();
  const [h, setH] = useState(8);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const [hh, mm] = (value || '08:00').split(':').map(Number);
    setH(Number.isFinite(hh) ? hh : 8);
    setM(Number.isFinite(mm) ? mm : 0);
  }, [visible, value]);

  const h12 = ((h + 11) % 12) + 1;
  const pm = h >= 12;
  const stepper = (label: string, val: number, up: () => void, down: () => void) => (
    <View style={{ alignItems: 'center', gap: 8, flex: 1 }}>
      <IconButton name="chevron-up" label={`Increase ${label}`} onPress={up} />
      <AnimatedNumber value={val} style={{ fontSize: 52, textAlign: 'center', minWidth: 80 }} duration={250} />
      <IconButton name="chevron-down" label={`Decrease ${label}`} onPress={down} />
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {stepper('hour', h12, () => setH((x) => (x + 1) % 24), () => setH((x) => (x + 23) % 24))}
          <Text v="display" color={t.textFaint}>:</Text>
          {stepper('minutes', m, () => setM((x) => (x + 5) % 60), () => setM((x) => (x + 55) % 60))}
        </View>
        <Segmented options={[{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]} value={pm ? 'PM' : 'AM'}
          onChange={(v) => setH((x) => (v === 'PM' ? (x % 12) + 12 : x % 12))} />
        <Button title="Set time" icon="checkmark" onPress={() => { onSave(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`); onClose(); }} />
      </View>
    </Sheet>
  );
}
