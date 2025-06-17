/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        blackops: ['"Black Ops One"', 'sans-serif'],
        rubik: ['"Rubik"', 'sans-serif'],
      },
      colors: {
        primary: '#0074D9',  // blue
        accent: '#FF851B',   // orange
        surface: '#f9f9f9',  // light background
      },
      borderRadius: {
        box: '1rem',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
}