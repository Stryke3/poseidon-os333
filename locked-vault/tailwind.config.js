/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "Inter", "Arial Black", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        amber: "0 0 22px rgba(255, 128, 22, .75), 0 0 86px rgba(255, 79, 0, .46)",
        redflash: "inset 0 0 140px rgba(255, 0, 0, .62)",
      },
      animation: {
        'shake': 'shake 0.5s',
        'fade-in': 'fadeIn 0.7s',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
};
