"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";

import { useWorkspaceMembers } from "@/components/workspace/row-properties";
import { api } from "../../../convex/_generated/api";

export function Mentions({ pagesLoaded }: { pagesLoaded: boolean }) {
  const router = useRouter();
  const mentions = useQuery(api.comments.mentions);
  const markRead = useMutation(api.comments.markMentionRead);
  const { members } = useWorkspaceMembers();

  if (!pagesLoaded || mentions === undefined || mentions.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="mb-1 flex min-h-9 items-center px-2">
        <h2 className="text-[16px] font-semibold leading-6 text-[#2c2c2b] dark:text-[#f0efed]">
          Mentions
        </h2>
      </div>
      <ul>
        {mentions.map((mention) => {
          const name =
            members.find((member) => member.userId === mention.userId)?.name ?? "Someone";
          const title = mention.title || "Untitled";
          return (
            <li key={mention._id}>
              <button
                type="button"
                onClick={() => {
                  void markRead({ commentId: mention._id }).finally(() => {
                    router.push(`/app/p/${mention.documentId}`);
                  });
                }}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-[6px] px-2 text-left hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate text-[16px] leading-6 text-foreground">
                  {name} mentioned you in {title}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
