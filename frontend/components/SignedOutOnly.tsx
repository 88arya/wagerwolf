"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthed } from "@/lib/auth";

export default function SignedOutOnly({ to = "/home" }: { to?: string }) {
  const router = useRouter();
  const authed = useAuthed();

  useEffect(() => {
    if (authed === true) router.replace(to);
  }, [authed, router, to]);

  return null;
}
