/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './styles/**/*.css',
  ],
  theme: {
    extend: {
      fontFamily: {
        blackops: ['"Black Ops One"', 'sans-serif'],
        rubik: ['"Rubik"', 'sans-serif'], // optional, in case you're using elsewhere
      },
      colors: {
        background: '#101010',
        surface: '#1a1a1a',
        accent: '#FF851B',
        primary: '#0094D9',
        muted: '#999999',
      },
      boxShadow: {
        card: '0 4px 14px rgba(0, 0, 0, 0.4)',
        orange: '0 0 12px rgba(255, 133, 27, 0.5)',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};