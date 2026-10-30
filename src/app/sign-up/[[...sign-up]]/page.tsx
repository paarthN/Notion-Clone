import { SignUp } from "@clerk/nextjs";

import { SetupScreen } from "@/components/setup-screen";
import { isPotionConfigured } from "@/lib/potion";

export default function SignUpPage() {
  if (!isPotionConfigured()) {
    return <SetupScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}
