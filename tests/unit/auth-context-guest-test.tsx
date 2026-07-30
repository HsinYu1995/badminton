import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth-context';

let mockSession: { user: { id: string; is_anonymous?: boolean } } | null = null;
let mockSkillLevel: number | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { skill_level: mockSkillLevel } }),
        }),
      }),
    }),
  },
}));

function GateProbe() {
  const { needsGuestSkillPick, markGuestSkillPicked } = useAuth();
  return (
    <>
      <Text testID="gate-probe">{String(needsGuestSkillPick)}</Text>
      <Pressable testID="mark-picked" onPress={markGuestSkillPicked}>
        <Text>mark</Text>
      </Pressable>
    </>
  );
}

describe('AuthProvider guest skill-pick gate', () => {
  it('resolves to false immediately for a non-anonymous session', async () => {
    mockSession = { user: { id: 'real-user-id' } };
    const { getByTestId } = await render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('false'));
  });

  it('resolves to true for an anonymous session with no skill_level yet', async () => {
    mockSession = { user: { id: 'guest-id', is_anonymous: true } };
    mockSkillLevel = null;
    const { getByTestId } = await render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('true'));
  });

  it('resolves to false for an anonymous session that already has a skill_level', async () => {
    mockSession = { user: { id: 'guest-id-2', is_anonymous: true } };
    mockSkillLevel = 5;
    const { getByTestId } = await render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('false'));
  });

  it('markGuestSkillPicked flips the gate to false without re-fetching', async () => {
    mockSession = { user: { id: 'guest-id-3', is_anonymous: true } };
    mockSkillLevel = null;
    const { getByTestId } = await render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('true'));
    fireEvent.press(getByTestId('mark-picked'));
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('false'));
  });
});
