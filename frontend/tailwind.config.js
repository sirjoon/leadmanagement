/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom dental CRM palette
        dental: {
          50: '#f0fdf9',
          100: '#ccfbee',
          200: '#99f6de',
          300: '#5ceaca',
          400: '#2ad4b2',
          500: '#10b99a',
          600: '#09957d',
          700: '#0b7766',
          800: '#0e5f53',
          900: '#104e45',
          950: '#042f2a',
        },
        // Accent colors for status badges
        status: {
          hot: '#ef4444',
          warm: '#f97316',
          cold: '#3b82f6',
          new: '#8b5cf6',
          appointment: '#10b981',
          visited: '#22c55e',
          dnc: '#6b7280',
          dnr: '#374151',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Clash Display', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
