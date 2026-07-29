export type ReverseGeocodedAddress = {
  region: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  streetNumber: string | null;
};

// Concatenates the non-null parts in largest-to-smallest administrative
// order (region, city, district, street, streetNumber) - the Taiwanese
// address convention, opposite of Western smallest-to-largest order.
// Returns null when every part is null (nothing to show).
export function composeZhAddress(parts: ReverseGeocodedAddress): string | null {
  const ordered = [parts.region, parts.city, parts.district, parts.street, parts.streetNumber];
  const present = ordered.filter((part): part is string => part != null && part.trim() !== '');
  const deduped = present.filter((part, i) => part !== present[i - 1]);
  if (deduped.length === 0) return null;
  return deduped.join('');
}
