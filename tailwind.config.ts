import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#646cff',
          dark: '#535bf2',
        },
      },
    },
  },
  plugins: [],
} satisfies Config

