# Potion

A shared workspace for nested pages. Sign-in and organizations are Clerk. Pages and the collaborative editor are Convex and BlockNote.

## Scripts

- `npm run dev` — local development
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
- `npx convex dev` — Convex backend and generated types

## First run

Use Clerk’s free Hobby plan and Convex’s free plan. Copy `.env.example` to `.env.local` after you create those projects. The app shows the setup steps until those keys exist. `npx convex dev` replaces `convex/_generated` with the real API.
