// null means the deployment has no Clerk secret, so the caller uses the fallback.
export async function clerkUserInOrg(orgId: string, userId: string) {
  const secret =
    typeof process === "undefined" ? undefined : process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) {
    return null;
  }

  const response = await fetch(
    `https://api.clerk.com/v1/organizations/${encodeURIComponent(orgId)}/memberships/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error("Could not verify workspace membership");
  }
  return true;
}
