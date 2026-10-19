import type { ReactNode } from "react";
import { MOUNTED_CLASSES } from "../wordmarkFonts";

export default function LogoLayout({ children }: { children: ReactNode }) {
  return (
    <div className={MOUNTED_CLASSES} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
