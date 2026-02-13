const isLegacy = process.env.VITE_LEGACY_BUILD === 'true';

module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    // En mode legacy (High Sierra), on transpile les CSS modernes:
    // oklch() -> rgb(), color-mix() -> rgb(), CSS nesting -> flat, etc.
    ...(isLegacy
      ? {
        'postcss-preset-env': {
          stage: 2,
          features: {
            'gap-properties': true,
            'oklab-function': true,
            'color-mix': true,
            'nesting-rules': true,
          },
          browsers: 'safari >= 11',
        },
      }
      : {}),
    autoprefixer: {},
  },
};
