import { SetupScreen } from "@/components/setup-screen";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { isPotionConfigured } from "@/lib/potion";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isPotionConfigured()) {
    return <SetupScreen />;
  }

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
