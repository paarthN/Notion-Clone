export function SetupScreen() {
  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm text-muted-foreground">Potion</p>
        <h1 className="font-serif text-4xl tracking-tight">Connect Clerk and Convex</h1>
      </div>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
        <li>
          Create a free Clerk app on the Hobby plan and turn on Organizations.
          Membership is required.
        </li>
        <li>
          In Clerk, enable the Convex integration and copy the Frontend API URL.
          Add a JWT template named <code>convex</code> with audience{" "}
          <code>convex</code>.
        </li>
        <li>
          Create a free Convex project. Run <code>npx convex dev</code>, then{" "}
          <code>npx convex env set CLERK_JWT_ISSUER_DOMAIN &lt;frontend-api-url&gt;</code>.
        </li>
        <li>
          Fill in <code>.env.local</code> from <code>.env.example</code> and restart{" "}
          <code>npm run dev</code>.
        </li>
      </ol>
    </main>
  );
}
