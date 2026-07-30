module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      // Metro (the real app bundle, never run with BABEL_ENV/NODE_ENV=test)
      // needs a bare `import()` left alone so it can code-split on it (see
      // src/app/(tabs)/create.tsx's lazy-loaded DateTimePicker) - Jest's CJS
      // environment can't execute that same native dynamic import without
      // --experimental-vm-modules, so only under test it gets rewritten to
      // a require()-based equivalent instead.
      test: {
        plugins: ['babel-plugin-dynamic-import-node'],
      },
    },
  };
};
