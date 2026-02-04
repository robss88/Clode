/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    // Include desktop app renderer files when used as postcss config
    '../../apps/desktop/src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Modern dark theme inspired by Cursor
        background: {
          DEFAULT: '#0d0d0d',
          secondary: '#141414',
          tertiary: '#1a1a1a',
          hover: '#242424',
          active: '#2a2a2a',
        },
        foreground: {
          DEFAULT: '#fafafa',
          secondary: '#a1a1a1',
          muted: '#666666',
        },
        border: {
          DEFAULT: '#2a2a2a',
          secondary: '#333333',
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
        // Diff colors
        diff: {
          add: '#22c55e',
          addBg: '#22c55e15',
          remove: '#ef4444',
          removeBg: '#ef444415',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
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
      boxShadow: {
        'glow': '0 0 20px rgba(124, 58, 237, 0.3)',
        'glow-sm': '0 0 10px rgba(124, 58, 237, 0.2)',
      },
    },
  },
  plugins: [],
};
