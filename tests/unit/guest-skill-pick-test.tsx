import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const FAKE_GUEST_SESSION = { user: { id: 'fake-guest-id', is_anonymous: true } };
const mockUpdate = jest.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
const mockMarkGuestSkillPicked = jest.fn();

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_GUEST_SESSION,
    isLoading: false,
    needsGuestSkillPick: true,
    markGuestSkillPicked: mockMarkGuestSkillPicked,
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ update: mockUpdate }) },
}));

describe('Guest skill-pick screen', () => {
  it('renders instead of the tabs when needsGuestSkillPick is true, saves the picked band, and calls markGuestSkillPicked', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    expect(screen.getByText("What's your skill level?")).toBeTruthy();
    expect(screen.queryByText('🏸 Discover')).toBeNull();

    await fireEvent.press(screen.getByText('Novice'));
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ skill_level: 1 }));
    await waitFor(() => expect(mockMarkGuestSkillPicked).toHaveBeenCalledTimes(1));
  });
});
