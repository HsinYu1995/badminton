function getLocales() {
  return [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US', textDirection: 'ltr' }];
}

module.exports = {
  getLocales,
  useLocales: getLocales,
};
