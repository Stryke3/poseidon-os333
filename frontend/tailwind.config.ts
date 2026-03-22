import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        mono: ["DM Mono", "monospace"],
        display: ["Bebas Neue", "Impact", "sans-serif"],
      },
      colors: {
        navy: "#05080f",
        "navy-2": "#0a0e1a",
        "navy-3": "#0f1525",
        "navy-4": "#151c30",
        "accent-blue": "#1a6ef5",
        "accent-gold": "#c9921a",
        "accent-gold-2": "#f0b432",
        "accent-green": "#0fa86a",
        "accent-red": "#e03a3a",
        "accent-amber": "#d4820f",
        "accent-purple": "#7c5af0",
        "accent-teal": "#0d9eaa",
      },
    },
  },
  plugins: [],
}

export default config
