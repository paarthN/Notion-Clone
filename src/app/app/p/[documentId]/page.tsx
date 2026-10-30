import { DocumentScreen } from "@/components/workspace/document-screen";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DocumentScreen documentId={documentId} />;
}
