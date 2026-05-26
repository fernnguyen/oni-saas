/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "../../packages/ui/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter-Regular", "sans-serif"],
        medium: ["Inter-Medium", "sans-serif"],
        semibold: ["Inter-SemiBold", "sans-serif"],
        bold: ["Inter-Bold", "sans-serif"],
        extrabold: ["Inter-ExtraBold", "sans-serif"],
        black: ["Inter-Black", "sans-serif"],
      },
    },
  },
  plugins: [],
}
