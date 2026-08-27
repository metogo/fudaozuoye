import { listProviderAvailability } from "../providers/config";

export function getProviders(): Response {
  return Response.json({ schemaVersion: "1.0", providers: listProviderAvailability() });
}
