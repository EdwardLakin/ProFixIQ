/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
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