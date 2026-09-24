/** The custom domain already routes /api to CloudBase. Keep its Strict cookies first-party. */
export function learningApiUrl(path: string): string {
  if (typeof window !== "undefined" &&
    (window.location.hostname === "fudaozuoye.com" || window.location.hostname === "www.fudaozuoye.com")) {
    return `/api${path}`;
  }
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  return `${configuredBase ?? "/api"}${path}`;
}
