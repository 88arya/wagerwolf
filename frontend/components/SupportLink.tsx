"use client";

import { useState } from "react";
import SupportModal from "@/components/SupportModal";
import type { SupportTopic } from "@/lib/support";

export default function SupportLink({
  children,
  className = "support-link",
  topic,
}: {
  children: React.ReactNode;
  className?: string;
  /** Which entry point this is - sets the modal's heading and the mail subject. */
  topic?: SupportTopic;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <SupportModal onClose={() => setOpen(false)} topic={topic} />}
    </>
  );
}
