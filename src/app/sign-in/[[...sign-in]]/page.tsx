import { SignIn } from "@clerk/nextjs";

import { SetupScreen } from "@/components/setup-screen";
import { isPotionConfigured } from "@/lib/potion";

export default function SignInPage() {
  if (!isPotionConfigured()) {
    return <SetupScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  );
}
