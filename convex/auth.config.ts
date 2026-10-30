import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Frontend API URL from the Clerk Convex integration.
      // Set it on the Convex deployment:
      // npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
