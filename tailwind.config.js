/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
  './app/**/*.{js,ts,jsx,tsx}',      // App Router pages
  './pages/**/*.{js,ts,jsx,tsx}',    // Optional: legacy Pages support
  './components/**/*.{js,ts,jsx,tsx}',
  './src/**/*.{js,ts,jsx,tsx}',      // Include src files
],

  theme: {
    extend: {
      colors: {
        background: '#101010',
        surface: '#1a1a1a',
        card: '#242424',
        primary: '#2062FF',
        accent: '#f97316',
        error: '#dc2626',
        warning: '#facc15',
        success: '#22c55e',
        muted: '#6b7280',
      },
      boxShadow: {
        card: '0 4px 14px rgba(0, 0, 0, 0.3)',
        accent: '0 10px 20px rgba(234, 244, 208, 0.6)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};