import type { Config } from "tailwindcss";

/**
 * Turfly's look: a floodlit pitch at night. Ink (the night pitch), chalk (line paint) for pages, grass green for
 * "go" and confirmed states, and volt (a training bib under floodlights) for the main action on every screen.
 * Neutrals are tinted towards the grass, and corners are tight, like line markings rather than bubbles.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f8ea", 100: "#e2f0cf", 200: "#c6e2a3", 300: "#a3d06f", 400: "#80b947",
          500: "#5f9f2e", 600: "#458323", 700: "#36671e", 800: "#2d521d", 900: "#26451c", 950: "#11260a",
        },
        // every page's greys, warmed towards the grass (replaces Tailwind's blue-grey slate)
        slate: {
          50: "#f5f4ee", 100: "#ebe9e0", 200: "#dbd8cb", 300: "#c1bdab", 400: "#8f8c7c",
          500: "#6a685b", 600: "#504f45", 700: "#3a3c33", 800: "#262a23", 900: "#151a14", 950: "#0b0f0b",
        },
        ink: { DEFAULT: "#0f1a13", 800: "#16251b", 700: "#1f3326", 600: "#2c4535" },
        volt: { DEFAULT: "#d7f74a", 300: "#e8fb94", 400: "#dff86b", 500: "#c6e835", 600: "#a9c923" },
        chalk: "#f5f4ee",
        pitch: { night: "#0f1a13" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { sm: "2px", DEFAULT: "3px", md: "4px", lg: "6px", xl: "8px", "2xl": "10px", "3xl": "14px" },
      boxShadow: {
        card: "0 1px 0 rgba(15,26,19,.06)",
        lift: "4px 4px 0 0 #0f1a13",
      },
    },
  },
  plugins: [],
} satisfies Config;
