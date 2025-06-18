/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './src/styles.css',
  ],
  theme: {
    extend: {
      fontFamily: {
        blackops: ['"Black Ops One"', 'sans-serif'],
      },
      colors: {
        background: '#101010',
        surface: '#1a1a1a',
        accent: '#FF851B',
        primary: '#0074D9',
        muted: '#999999',
      },
      boxShadow: {
        card: '0 4px 14px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};