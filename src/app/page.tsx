import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { SetupScreen } from "@/components/setup-screen";
import { isPotionConfigured } from "@/lib/potion";

export default async function Home() {
  if (!isPotionConfigured()) {
    return <SetupScreen />;
  }

  const { userId } = await auth();
  redirect(userId ? "/app" : "/sign-in");
}
