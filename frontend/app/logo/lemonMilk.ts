import localFont from "next/font/local";

// Only /logo shows this face, so only /logo imports it (see app/wordmarkFonts.ts).
export const lemonMilk = localFont({
  src: [
    { path: "../fonts/lemon-milk/LemonMilk-Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/lemon-milk/LemonMilk-Medium.otf", weight: "500", style: "normal" },
    { path: "../fonts/lemon-milk/LemonMilk-Bold.otf", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-lemon-milk",
  fallback: ["Inter Tight", "system-ui", "sans-serif"],
});
