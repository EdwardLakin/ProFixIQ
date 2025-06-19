/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        header: ['"Black Ops One"', 'sans-serif'],
        rubik: ['"Rubik"', 'sans-serif'],
      },
      colors: {
        background: '#101010',
        surface: '#1a1a1a',
        accent: '#FF851B',
        primary: '#0f172a',
        secondary: '#999999',
      },
      boxShadow: {
        card: '0 4px 12px rgba(0, 0, 0, 0.4)',
        glow: '0 0 8px rgba(255, 115, 0, 0.6)',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};