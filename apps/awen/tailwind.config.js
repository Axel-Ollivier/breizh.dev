/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#181A1A',
        ink: '#FAFAEC',
        moss: '#2A9B77',
        wave: '#2A7AAA',
      },
      fontFamily: {
        display: ['"Exo 2"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
