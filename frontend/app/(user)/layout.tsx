"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /home, /leaderboard.
 *
 * No nav of its own. The utility bar and the games strip are mounted globally
 * in the root layout (see components/AppChrome), and the UserNav that used to
 * sit under the strip here is gone — the utility bar already carries Home, so
 * it was a second row of the same links.
 *
 * All this layout still owns is the signed-in guard.
 */
export default function UserLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("token")) router.replace("/");
  }, []);

  return <>{children}</>;
}
