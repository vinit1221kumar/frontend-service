/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f'
        },
        /** Dark theme: deep navy (easier on eyes at night than brown-amber) */
        navy: {
          50: '#e8eef9',
          100: '#d1dcf0',
          200: '#a3b8e0',
          300: '#7591d0',
          400: '#4a6bb8',
          500: '#3d5a96',
          600: '#2f4673',
          700: '#26395c',
          800: '#1c2d47',
          900: '#132238',
          950: '#0a1628'
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

