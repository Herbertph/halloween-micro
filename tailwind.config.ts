import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#08060c",
        night: "#120c1c",
        ember: "#ff7a18",
        emberDark: "#c94f00",
        pumpkin: "#ff9f1c",
        hex: "#9b5cff",
        bone: "#f6efe6",
      },
      fontFamily: {
        display: [
          "ui-rounded",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        body: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,122,24,.35), 0 18px 60px -20px rgba(255,122,24,.55)",
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        drift: "drift 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
