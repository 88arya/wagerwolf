import type { ReactNode } from "react";
import { arcaMajora, gilroy } from "../wordmarkFonts";
import { lemonMilk } from "./lemonMilk";

const MOUNTED_CLASSES = [gilroy.variable, lemonMilk.variable, arcaMajora.variable].join(" ");

export default function LogoLayout({ children }: { children: ReactNode }) {
  return (
    <div className={MOUNTED_CLASSES} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
