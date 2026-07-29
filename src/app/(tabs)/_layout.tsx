import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Court, Font } from '@/constants/badminton-theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Court.featherDark,
        tabBarInactiveTintColor: Court.inkSecondary,
        tabBarStyle: { backgroundColor: Court.shuttle, borderTopColor: Court.line },
        tabBarLabelStyle: { fontFamily: Font.display, fontSize: 12 },
        headerStyle: { backgroundColor: Court.greenDeep },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: Font.displayBlack, fontSize: 20 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Discover', tabBarIcon: ({ focused }) => <TabIcon emoji="🔎" focused={focused} /> }}
      />
      <Tabs.Screen
        name="create"
        options={{ title: 'Create', tabBarIcon: ({ focused }) => <TabIcon emoji="🏸" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tabs>
  );
}
