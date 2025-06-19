/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}', // optional, if using src/
  ],
  theme: {
    extend: {
      fontFamily: {
        rubik: ['Rubik', 'sans-serif'],
        blackops: ['"Black Ops One"', 'cursive'],
      },
      colors: {
        background: '#0e0e0e',
        accent: '#f97316', // orange-500
      },
    },
  },
  plugins: [],
};