import type { ReactNode } from "react";
import { MOUNTED_CLASSES } from "../wordmarkFonts";

/**
 * Mounts every candidate face's CSS variable so /logo can draw all of them on
 * one screen.
 *
 * The classes come from app/wordmarkFonts.ts rather than being listed here, so
 * adding a font to the registry lights it up on this page without anyone having
 * to remember a second file.
 *
 * `display: contents` keeps the wrapper out of the layout — the page uses
 * `.page-wide`, which has to stay a direct flex child of .app-scroll for its
 * min-height to resolve against the scroller.
 */
export default function LogoLayout({ children }: { children: ReactNode }) {
  return (
    <div className={MOUNTED_CLASSES} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
