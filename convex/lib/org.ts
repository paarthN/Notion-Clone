import type { UserIdentity } from "convex/server";

type AuthReader = {
  auth: {
    getUserIdentity(): Promise<UserIdentity | null>;
  };
};

export type OrgContext = {
  orgId: string;
  userId: string;
  name: string;
  imageUrl: string | null;
  role: "admin" | "member";
};

export async function requireOrg(ctx: AuthReader): Promise<OrgContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const orgId = readOrgId(identity);
  if (!orgId) {
    throw new Error("No active organization");
  }

  return {
    orgId,
    userId: identity.subject,
    name: identity.name ?? "Member",
    imageUrl: identity.pictureUrl ?? null,
    role: readRole(identity),
  };
}

function readOrgId(identity: UserIdentity) {
  const claims = identity as UserIdentity & {
    org_id?: unknown;
    orgId?: unknown;
    o?: { id?: unknown };
  };

  if (typeof claims.org_id === "string" && claims.org_id) {
    return claims.org_id;
  }
  if (typeof claims.orgId === "string" && claims.orgId) {
    return claims.orgId;
  }
  if (typeof claims.o?.id === "string" && claims.o.id) {
    return claims.o.id;
  }
  return null;
}

function readRole(identity: UserIdentity): "admin" | "member" {
  const claims = identity as UserIdentity & {
    org_role?: unknown;
    orgRole?: unknown;
  };
  const role = claims.org_role ?? claims.orgRole;
  return role === "org:admin" ? "admin" : "member";
}
