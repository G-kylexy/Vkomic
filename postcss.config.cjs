const isLegacy = process.env.VITE_LEGACY_BUILD === 'true';

module.exports = {
    plugins: {
        '@tailwindcss/postcss': {},
        ...(isLegacy
            ? {
                'postcss-preset-env': {
                    stage: 2,
                    features: {
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
