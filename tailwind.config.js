/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/styles.css',
  ],
  theme: {
    extend: {
      fontFamily: {
        blackops: ['"Black Ops One"', 'sans-serif'],
        rubik: ['Rubik', 'sans-serif'],
      },
      colors: {
        background: '#101010',   // main dark background
        surface: '#1a1a1a',      // tile/card background
        accent: '#FF851B',       // orange accent
        primary: '#0074D9',      // blue hover/focus option
        muted: '#999999',        // subdued subtitle color
      },
      boxShadow: {
        card: '0 4px 14px rgba(0,0,0,0.4)',
      },
      spacing: {
        'screen-sm': '90vh',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}