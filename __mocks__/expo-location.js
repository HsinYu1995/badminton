// __mocks__/expo-location.js
function requestForegroundPermissionsAsync() {
  return Promise.resolve({ granted: true });
}

function getForegroundPermissionsAsync() {
  return Promise.resolve({ granted: true });
}

function getCurrentPositionAsync() {
  return Promise.resolve({ coords: { latitude: 25.033, longitude: 121.5654 } });
}

function reverseGeocodeAsync() {
  return Promise.resolve([
    { region: '台北市', city: '大安區', district: null, street: '和平東路二段', streetNumber: '106號' },
  ]);
}

module.exports = {
  requestForegroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getCurrentPositionAsync,
  // Wrapped in jest.fn() (rather than exported as a plain function like its
  // siblings above) so tests can assert on call counts, e.g. proving the
  // en-US path never geocodes (tests/unit/create-submit-test.tsx).
  reverseGeocodeAsync: jest.fn(reverseGeocodeAsync),
};
