import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const mockInsert = jest.fn(() => ({
  select: () => ({
    single: () =>
      Promise.resolve({
        data: {
          id: 'venue-new',
          name: 'New Court',
          address: '456 New Rd',
          address_zh: null,
          latitude: 25.033,
          longitude: 121.5654,
        },
        error: null,
      }),
  }),
}));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_SESSION,
    isLoading: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'venues') {
        return {
          select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          insert: mockInsert,
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it('normalizes a blank Mandarin address input to null in the insert payload', async () => {
  await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
  await screen.findByText('🏸 Host a game');

  await fireEvent.press(screen.getByText('+ Add new venue'));

  await fireEvent.changeText(screen.getByPlaceholderText('Venue name'), 'New Court');
  await fireEvent.changeText(screen.getByPlaceholderText('Address'), '456 New Rd');
  // Mandarin address input is left blank on purpose.

  await fireEvent.press(screen.getByText('Use current location'));
  await screen.findByText('Location captured');

  await fireEvent.press(screen.getByText('Save venue'));

  await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'New Court',
      address: '456 New Rd',
      address_zh: null,
    })
  );
});
