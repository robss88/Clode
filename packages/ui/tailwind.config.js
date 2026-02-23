const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // Use absolute paths to ensure they work regardless of where postcss runs
    path.join(__dirname, './src/**/*.{js,ts,jsx,tsx}'),
    path.join(__dirname, '../../apps/desktop/src/renderer/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#141414',
          secondary: '#1a1a1a',
          tertiary: '#2a2a2a',
          hover: '#ffffff0f',
          active: '#ffffff1a',
        },
        foreground: {
          DEFAULT: '#e4e4e4',
          secondary: '#a1a1a1',
          muted: '#555555',
        },
        border: {
          DEFAULT: '#ffffff0f',
          secondary: '#ffffff1a',
        },
        accent: {
          DEFAULT: '#7c3aed',
          hover: '#8b5cf6',
          muted: '#7c3aed20',
        },
        success: {
          DEFAULT: '#22c55e',
          muted: '#22c55e20',
        },
        warning: {
          DEFAULT: '#eab308',
          muted: '#eab30820',
        },
        error: {
          DEFAULT: '#ef4444',
          muted: '#ef444420',
        },
        diff: {
          add: '#22c55e',
          addBg: '#22c55e15',
          remove: '#ef4444',
          removeBg: '#ef444415',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': '0.65rem',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
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
        slideLeft: {
          '0%': { opacity: '0', transform: 'translateX(10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
