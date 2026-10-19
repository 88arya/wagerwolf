"use client";

import { usePathname } from "next/navigation";

const NO_FOOTER = ["/signup", "/sign-in", "/auth", "/settings", "/docs"];

export default function FooterSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const hidden = NO_FOOTER.some(p => pathname === p || pathname.startsWith(`${p}/`));
  if (hidden) return null;
  return <>{children}</>;
}
