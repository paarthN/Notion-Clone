import { SetupScreen } from "@/components/setup-screen";
import { PublicPage } from "@/components/workspace/public-page";
import { isPotionConfigured } from "@/lib/potion";

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!isPotionConfigured()) {
    return <SetupScreen />;
  }

  const { token } = await params;
  return <PublicPage token={token} />;
}
