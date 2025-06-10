/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f0f0f',
        surface: '#1a1a1a',
        card: '#242424',
        primary: '#00C2FF',
        accent: '#16f4d0',
        warning: '#facc15',
        error: '#f43f5e',
        success: '#22c55e',
        muted: '#6b7280',
      },
      boxShadow: {
        card: '0 4px 14px rgba(0, 0, 0, 0.3)',
        accent: '0 0 10px rgba(22, 244, 208, 0.6)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};