import type { Config } from "tailwindcss";

/** Tailwind maps to the Loamy CSS tokens in globals.css. Use these names, never raw hex values. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--loamy-canvas)",
        card: "var(--loamy-card)",
        line: { DEFAULT: "var(--loamy-border)", strong: "var(--loamy-border-strong)", soft: "var(--loamy-divider)" },
        chip: "var(--loamy-chip)",
        ink: { DEFAULT: "var(--loamy-black)", muted: "var(--loamy-muted)", "on-black": "var(--loamy-muted-on-black)" },
        lemon: { DEFAULT: "var(--loamy-lemon)", hover: "var(--loamy-lemon-hover)" },
        sage: "var(--loamy-sage)",
        leaf: { DEFAULT: "var(--loamy-leaf)", pale: "var(--loamy-pale-leaf)", ink: "var(--loamy-leaf-ink)" },
        peach: "var(--loamy-peach)",
        sky: "var(--loamy-sky)",
        lilac: "var(--loamy-lilac)",
        ph: { green: "var(--loamy-ph-green)", cream: "var(--loamy-ph-cream)", grey: "var(--loamy-ph-grey)" },
        danger: { bg: "var(--loamy-error-bg)", ink: "var(--loamy-error-ink)" },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
      },
      fontSize: {
        eyebrow: ["12px", { lineHeight: "1.3", letterSpacing: "0.06em", fontWeight: "600" }],
        small: ["13px", { lineHeight: "1.45" }],
        body: ["15px", { lineHeight: "1.5" }],
        title: ["32px", { lineHeight: "1.1", letterSpacing: "-0.035em", fontWeight: "700" }],
        hero: ["36px", { lineHeight: "1.05", letterSpacing: "-0.035em", fontWeight: "700" }],
        big: ["46px", { lineHeight: "1", letterSpacing: "-0.045em", fontWeight: "700" }],
      },
      borderRadius: {
        card: "var(--loamy-radius-card)",
        hero: "var(--loamy-radius-hero)",
      },
      boxShadow: {
        nav: "0 10px 30px rgb(10 10 10 / 0.18)",
      },
      spacing: {
        "nav-clearance": "var(--loamy-nav-clearance)",
      },
    },
  },
  plugins: [],
} satisfies Config;
