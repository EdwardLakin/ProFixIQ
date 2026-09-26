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
        // `background` and `border` are also used with Tailwind opacity
        // modifiers (e.g. `bg-background/95`, `border-border/60`). Tailwind
        // can only apply an opacity modifier to a color it can parse, so a
        // bare `var(--theme-*)` reference here would silently generate no
        // rule at all for the modified classes. Backing them with a plain
        // `R G B` channel variable (which also has a light-mode override in
        // globals.css) via the `<alpha-value>` recipe lets Tailwind apply
        // the modifier. Note this makes the *unmodified* `border-border`
        // resolve to a solid, full-opacity border (Tailwind's `<alpha-value>`
        // convention defaults to 1, not the translucent `--theme-border-soft`
        // default used elsewhere) -- still a strict improvement over the
        // previous no-rule-at-all state, just more solid than the app's
        // usual soft borders.
        background: "rgb(var(--theme-surface-page-rgb) / <alpha-value>)",
        foreground: "var(--theme-text-primary)",
        border: "rgb(var(--theme-border-rgb) / <alpha-value>)",
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
          // Paired with the shop's configured button background/text (which
          // may be customized independently of the general brand primary
          // swatch), not the general `--brand-primary` swatch, so the two
          // stay a matched, readable pair.
          DEFAULT: "var(--theme-button-primary-bg)",
          foreground: "var(--theme-button-primary-text)",
        },
        secondary: {
          DEFAULT: "var(--theme-button-secondary-bg)",
          foreground: "var(--theme-button-secondary-text)",
        },
        destructive: {
          // Solid per-mode red (not the translucent color-mix danger-text
          // token) so opacity modifiers like `bg-destructive/10` resolve,
          // and readable on its own in both dark and light surfaces.
          DEFAULT: "rgb(var(--theme-destructive-rgb) / <alpha-value>)",
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