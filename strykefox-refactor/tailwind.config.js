/** @type {import('tailwindcss').Config } */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,css}",
    "./components/**/*.{js,ts,jsx,tsx,css}",
  ],
  theme: {
    extend: {
      colors: {
        'navy-black': '#060B14',
        'carbon-navy': '#0E1726',
        'surgical-white': '#F5F7FA',
        'muted-steel': '#7C92A6',
        'restrained-amber': '#B89C5E',
        'verification-cyan': '#0891B2',
        navy: '#0B1F3A',
        'navy-dark': '#05080F',
        'navy-light': '#08111F',
        gold: '#F0B432',
        'gold-light': '#FFD7D3',
        white: '#FFFFFF',
        'white-80': 'rgba(255, 255, 255, 0.8)',
        'white-60': 'rgba(255, 255, 255, 0.6)',
        'white-40': 'rgba(255, 255, 255, 0.4)',
        'white-20': 'rgba(255, 255, 255, 0.2)',
        'white-10': 'rgba(255, 255, 255, 0.1)',
        border: 'rgba(255, 255, 255, 0.08)',
        carbon: {
          black: '#000000',
          gray: {
            50: '#3A3A3A',
            100: '#E5E5E5',
          },
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Monaco', 'Consolas', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '20': '5rem',
        '24': '6rem',
        '32': '8rem',
        '48': '12rem',
        '64': '16rem',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(255, 255, 255, 0.1)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.08)',
      },
      backdropBlur: {
        '20px': 'blur(20px)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
}
