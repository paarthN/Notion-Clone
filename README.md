# Potion

A shared notebook for students. Notion has a lot of ways to set up a page, and most of that gets in the way when you need class notes and a list of what is due. Potion keeps pages, folders, a to-do board, and a way to work on the same page with someone else.

A workspace is one class or one group. Sign-in and membership are Clerk. The pages and the editor are Convex and BlockNote.

## What it can do

You write in pages, and you file those pages and boards in a folder from the sidebar. A to-do board can be a table or a board grouped by status. Each task is still a normal page, with a status, a due date, and a person.

Other people in the workspace can type in the same page at the same time, and you can see their cursor. On each page you choose who can edit, who can only view, and who cannot open it. Turning on a link makes that page view-only, so someone can read it without joining the workspace.

The home page lists open tasks that are overdue or due over the next few days, grouped under their board. Checking one off marks it done. Select a sentence to leave a comment in the margin. If a rewrite goes wrong, you can put the page back to an earlier save.

## Run it

Use Clerk’s free Hobby plan and Convex’s free plan. Copy `.env.example` to `.env.local` after those projects exist. The app shows the setup steps until the keys are filled in.

```bash
npm install
npx convex dev
npm run dev
```

`npx convex dev` writes the Convex URL and the generated API. Set `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment as well as in `.env.local`.

- `npm run dev` — local app
- `npm test` — access, sharing, and task-list tests
- `npm run lint` — ESLint
