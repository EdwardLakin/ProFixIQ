/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/styles.css',
  ],
  theme: {
    extend: {
      fontFamily: {
        blackops: ['"Black Ops One"', 'sans-serif'],
        heading: ['"Black Ops One"', 'sans-serif'],
        rubik: ['Rubik', 'sans-serif'],
      },
      colors: {
        background: '#101010', // dark background
        surface: '#1a1a1a',     // tile background
        accent: '#FF851B',      // orange accent
        primary: '#0074D9',     // optional blue for hover/buttons
        muted: '#999999',       // subtitle/hint text
      },
      boxShadow: {
        card: '0 4px 14px rgba(0,0,0,0.4)', // tile shadow
      },
      spacing: {
        'screen-sm': '90vh',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};