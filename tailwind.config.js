/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./features/**/*.{js,ts,jsx,tsx}",
    "./shared/**/*.{js,ts,jsx,tsx}",
  ],

  // 👇 enables dark/light toggling by adding/removing a 'dark' class to <html> or <body>
  darkMode: "class",

  theme: {
    extend: {
      /* ------------------------------------------------------------- */
      /* 🅰️ Fonts                                                     */
      /* ------------------------------------------------------------- */
      fontFamily: {
        // Main app font (UI)
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        // Display font for landing/marketing
        display: [
          "var(--font-blackops)",
          "var(--font-inter)",
          "system-ui",
          "sans-serif",
        ],
        // Optional Roboto fallback
        roboto: [
          "var(--font-roboto)",
          "system-ui",
          "sans-serif",
        ],
      },

      /* ------------------------------------------------------------- */
      /* 🎨 Color Tokens — Dark & Light Themes                        */
      /* ------------------------------------------------------------- */
      colors: {
        // brand accent stays consistent
        accent: "#FF851B",

        // dark mode
        dark: {
          background: "#101010",
          surface: "#1a1a1a",
          text: "#ffffff",
          muted: "#999999",
        },

        // light mode
        light: {
          background: "#f7f7f7",
          surface: "#ffffff",
          text: "#111111",
          muted: "#444444",
        },

        /* -----------------------------------------------------------
         * Semantic tokens (shadcn/ui-style naming) used across dozens
         * of components (`bg-background`, `text-foreground`,
         * `bg-muted`, `text-muted-foreground`, `border-border`, etc.)
         * that previously had no matching color definition here, so
         * Tailwind generated no rule for them at all and the affected
         * text/surfaces silently fell back to the browser default
         * (unstyled) color. These alias the existing CSS custom
         * properties so every one of those classes now resolves to
         * the same theme already used everywhere else, and continues
         * to respond to the light/dark `data-theme-mode` toggle.
         * ----------------------------------------------------------- */
        background: "var(--theme-surface-page)",
        foreground: "var(--theme-text-primary)",
        border: "var(--theme-border-soft)",
        ring: "var(--brand-accent)",
        muted: {
          DEFAULT: "var(--theme-surface-subtle)",
          foreground: "var(--theme-text-muted)",
        },
        card: {
          DEFAULT: "var(--theme-card-bg)",
          foreground: "var(--theme-text-primary)",
        },
        popover: {
          DEFAULT: "var(--theme-surface-overlay)",
          foreground: "var(--theme-text-primary)",
        },
        primary: {
          DEFAULT: "var(--brand-primary)",
          foreground: "var(--theme-button-primary-text)",
        },
        secondary: {
          DEFAULT: "var(--theme-button-secondary-bg)",
          foreground: "var(--theme-button-secondary-text)",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },
      },

      /* ------------------------------------------------------------- */
      /* 🌫️ Shadows                                                  */
      /* ------------------------------------------------------------- */
      boxShadow: {
        card: "0 4px 12px rgba(0, 0, 0, 0.4)",
        glow: "0 0 8px rgba(255, 115, 0, 0.6)",
      },

      /* ------------------------------------------------------------- */
      /* 🔤 Typography overrides                                     */
      /* ------------------------------------------------------------- */
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme("colors.dark.text"),
            a: {
              color: theme("colors.accent"),
              "&:hover": { color: "#ffa94d" },
            },
            h1: { fontFamily: theme("fontFamily.display").join(",") },
            h2: { fontFamily: theme("fontFamily.display").join(",") },
            h3: { fontFamily: theme("fontFamily.sans").join(",") },
          },
        },
        invert: {
          css: {
            color: theme("colors.light.text"),
            a: {
              color: theme("colors.accent"),
              "&:hover": { color: "#ff9e33" },
            },
          },
        },
      }),
    },
  },

  /* --------------------------------------------------------------- */
  /* 🌙 Plugins                                                     */
  /* --------------------------------------------------------------- */
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/aspect-ratio"),
  ],
};