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
      fontSize: {
        // Custom semantic sizes for +2px global scaling
        'micro': ['10px', '14px'],   // gốc: 8px
        'xxs': ['12px', '16px'],     // gốc: 10px
        'tiny': ['14px', '18px'],    // gốc: 12px
        'xs': ['14px', '20px'],      // gốc: 12px
        'sm': ['16px', '24px'],      // gốc: 14px
        'base': ['18px', '28px'],    // gốc: 16px
        'lg': ['20px', '32px'],      // gốc: 18px
        'xl': ['22px', '34px'],      // gốc: 20px
        '2xl': ['26px', '38px'],     // gốc: 24px
        '3xl': ['32px', '45px'],     // gốc: 30px
        '4xl': ['38px', '52px'],     // gốc: 36px
        '5xl': ['50px', '1'],        // gốc: 48px
      },
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
