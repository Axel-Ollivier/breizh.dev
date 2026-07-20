import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // engine/ est pur : ni React, ni Tone, ni store, ni horloge JS, ni Math.random.
    // Les groupes relatifs bloquent aussi le contournement par chemin (../state/…).
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'tone', 'zustand', '**/state/**', '**/audio/**', '**/ui/**'],
              message: 'engine/ est pur : aucun import de React, Tone, du store ou des autres couches.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Utiliser le PRNG seedé (engine/prng).' },
        { object: 'Date', property: 'now', message: 'engine/ ne dépend pas de l’horloge.' },
      ],
    },
  },
  {
    // ui/ ne touche jamais Tone directement — passer par audio/.
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['tone'], message: 'ui/ ne touche jamais Tone : passer par audio/.' }] },
      ],
    },
  },
  {
    // audio/ encapsule Tone, il n'importe pas React.
    files: ['src/audio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['react', 'react-*'], message: 'audio/ n’importe pas React.' }] },
      ],
    },
  },
  prettier,
);
