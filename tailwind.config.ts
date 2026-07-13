import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        card: "var(--card)",
        surface: "var(--surface)",
        line: "var(--line)",
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-soft)",
        },
        postit: "var(--postit)",
        tape: "var(--tape)",
        mk: {
          green: "var(--mk-green)",
          orange: "var(--mk-orange)",
          red: "var(--mk-red)",
        },
        hl: {
          green: "var(--hl-green)",
          orange: "var(--hl-orange)",
          red: "var(--hl-red)",
        },
      },
      fontFamily: {
        hand: ["var(--font-display)"],
        scrawl: ["var(--font-scrawl)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        wonky: "var(--radius-wonky)",
        oval: "var(--radius-oval)",
        scrap: "var(--radius-scrap)",
      },
      boxShadow: {
        doodle: "4px 5px 0 var(--shadow)",
      },
    },
  },
  plugins: [],
};

export default config;
