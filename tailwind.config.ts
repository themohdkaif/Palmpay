import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0F1A14",
        paper: "#F1ECDD",
        brass: {
          DEFAULT: "#B08D46",
          bright: "#D4AF6A",
          dark: "#7A6432",
        },
        vein: {
          DEFAULT: "#7A2E2E",
          bright: "#A33B3B",
        },
        line: {
          DEFAULT: "#3A4A3E",
          light: "#526857",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"],
      },
      boxShadow: {
        "brass-glow": "0 0 20px rgba(176, 141, 70, 0.2)",
        "brass-border": "0 0 0 1px #B08D46",
        certificate: "0 20px 40px -15px rgba(0, 0, 0, 0.7)",
      },
    },
  },
  plugins: [],
};

export default config;
