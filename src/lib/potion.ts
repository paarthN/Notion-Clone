export function isPotionConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_CONVEX_URL,
  );
}
