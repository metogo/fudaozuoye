import { listProviderAvailability } from "@/lib/learning/providers/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ schemaVersion: "1.0", providers: listProviderAvailability() });
}
