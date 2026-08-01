import { selectOrThrow } from '@/lib/mutations';

describe('selectOrThrow', () => {
  it('returns the rows when the query matched at least one', async () => {
    const rows = await selectOrThrow(Promise.resolve({ data: [{ id: '1' }], error: null }), 'not found');
    expect(rows).toEqual([{ id: '1' }]);
  });

  it('throws the given message when the query matched zero rows and reported no error', async () => {
    await expect(selectOrThrow(Promise.resolve({ data: [], error: null }), 'This request is no longer available.')).rejects.toThrow(
      'This request is no longer available.'
    );
  });

  it('throws the given message when data is null and reported no error', async () => {
    await expect(selectOrThrow(Promise.resolve({ data: null, error: null }), 'gone')).rejects.toThrow('gone');
  });

  it('rethrows the underlying error when the query reported one, ignoring the not-found message', async () => {
    await expect(selectOrThrow(Promise.resolve({ data: null, error: { message: 'network down' } }), 'gone')).rejects.toMatchObject({
      message: 'network down',
    });
  });
});
