import { lazy, Suspense } from 'react';
import { ActivityIndicator } from 'react-native';
import { Court } from '@/constants/badminton-theme';
import { getEventDateBounds } from '@/lib/date-range';

// Lazy-loaded (Metro code-splits on dynamic import() for web production
// builds - see date-picker-field.web.tsx for why this native module never
// actually runs there): @expo/ui's native community picker is only ever
// used on the Create screen, so there's no reason its cost is in the bundle
// everyone downloads just to sign in and browse Discover. Re-wrapped as a
// default export since React.lazy only resolves modules shaped that way.
const NativeDateTimePicker = lazy(() =>
  import('@expo/ui/community/datetime-picker').then((mod) => ({ default: mod.DateTimePicker }))
);

type DatePickerFieldProps = {
  value: Date;
  onChange: (date: Date) => void;
};

// iOS/Android: the real OS-native picker. See date-picker-field.web.tsx for
// the web equivalent - @expo/ui has no web implementation at all (it
// renders nothing there), so that file is a completely different control,
// not a fallback path through this one.
export function DatePickerField({ value, onChange }: DatePickerFieldProps) {
  const { min, max } = getEventDateBounds();
  return (
    <Suspense fallback={<ActivityIndicator color={Court.green} />}>
      <NativeDateTimePicker
        mode="date"
        value={value}
        onValueChange={(_event, newDate) => onChange(newDate)}
        presentation="inline"
        display="spinner"
        minimumDate={min}
        maximumDate={max}
      />
    </Suspense>
  );
}
