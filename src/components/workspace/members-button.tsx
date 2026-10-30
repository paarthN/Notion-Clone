"use client";

import { useClerk } from "@clerk/nextjs";
import { Users } from "lucide-react";

export function MembersButton() {
  const { openOrganizationProfile } = useClerk();

  return (
    <button
      type="button"
      className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-accent"
      aria-label="Members"
      onClick={() =>
        openOrganizationProfile({
          __experimental_startPath: "/organization-members",
        })
      }
    >
      <Users className="size-4" />
    </button>
  );
}
