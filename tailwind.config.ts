import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf3", 100: "#d1fadf", 200: "#a6f4c5", 300: "#6ce9a6", 400: "#32d583",
          500: "#12b76a", 600: "#039855", 700: "#027a48", 800: "#05603a", 900: "#054f31", 950: "#022c1c",
        },
        pitch: { night: "#07130d" },
      },
      fontFamily: { sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.06), 0 8px 24px -12px rgba(16,24,40,.18)" },
    },
  },
  plugins: [],
} satisfies Config;
