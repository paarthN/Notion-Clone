import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import componentSchema from "./components/prosemirrorSync/schema";
import { documentSearchText } from "./lib/searchText";
import schema from "./schema";
import { modules, prosemirrorModules } from "./test.setup";

let savedClerkKey: string | undefined;

beforeEach(() => {
  savedClerkKey = process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_SECRET_KEY;
});

afterEach(() => {
  if (savedClerkKey === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = savedClerkKey;
  }
});

const ORG = "org_acme";
const CREATOR = "user_creator";
const MEMBER = "user_member";

function potionTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("prosemirrorSync", componentSchema, prosemirrorModules);
  return t;
}

function asUser(
  t: ReturnType<typeof potionTest>,
  userId: string,
  role: "admin" | "member" = "member",
  orgId = ORG,
) {
  return t.withIdentity({
    subject: userId,
    name: userId,
    org_id: orgId,
    org_role: role === "admin" ? "org:admin" : "org:member",
  });
}

async function insertPage(
  t: ReturnType<typeof potionTest>,
  fields: {
    title?: string;
    orgId?: string;
    createdBy?: string;
    generalAccess?: "edit" | "view" | "none";
    shareToken?: string;
    plainText?: string;
    parentId?: Id<"documents"> | null;
  } = {},
) {
  const title = fields.title ?? "Notes";
  const plainText = fields.plainText ?? "";
  return await t.run(async (ctx) => {
    return await ctx.db.insert("documents", {
      orgId: fields.orgId ?? ORG,
      parentId: fields.parentId ?? null,
      title,
      icon: null,
      coverUrl: null,
      isArchived: false,
      position: 0,
      createdBy: fields.createdBy ?? CREATOR,
      updatedAt: 1,
      plainText,
      searchText: documentSearchText(title, plainText),
      ...(fields.generalAccess ? { generalAccess: fields.generalAccess } : {}),
      ...(fields.shareToken ? { shareToken: fields.shareToken } : {}),
    });
  });
}

test("a member with no access row can edit when general access is unset", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Open notes" });
  const member = asUser(t, MEMBER);

  await member.mutation(api.documents.rename, { id, title: "Edited notes" });

  const page = await t.run(async (ctx) => ctx.db.get("documents", id));
  expect(page?.title).toBe("Edited notes");
});

test("no access sticks for edit, list, and search", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Shared notes", plainText: "shared body" });
  const creator = asUser(t, CREATOR);
  const member = asUser(t, MEMBER);

  await creator.action(api.documents.setAccess, {
    id,
    userId: MEMBER,
    level: "none",
  });

  await expect(member.mutation(api.documents.rename, { id, title: "Nope" })).rejects.toThrow(
    "Page not found",
  );
  const listed = await member.query(api.documents.list);
  expect(listed.map((page) => page._id)).not.toContain(id);
  const hits = await member.query(api.documents.search, { query: "Shared" });
  expect(hits).toEqual([]);
});

test("an organization admin still has full access", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Private notes", generalAccess: "none" });
  const admin = asUser(t, "user_admin", "admin");

  const access = await admin.query(api.documents.pageAccess, { id });
  expect(access.level).toBe("full");
});

test("a private page is hidden from other members and visible to its creator", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Private notes", generalAccess: "none" });
  const member = asUser(t, MEMBER);
  const creator = asUser(t, CREATOR);

  const memberList = await member.query(api.documents.list);
  expect(memberList.map((page) => page._id)).not.toContain(id);
  const creatorList = await creator.query(api.documents.list);
  expect(creatorList.map((page) => page._id)).toContain(id);
});

test("a document in another organization is not found", async () => {
  const t = potionTest();
  const id = await insertPage(t, { orgId: "org_other", title: "Elsewhere" });
  const member = asUser(t, MEMBER);

  await expect(member.mutation(api.documents.rename, { id, title: "Stolen" })).rejects.toThrow(
    "Page not found",
  );
});

test("a workspace admin from the compact session claim can trash another member's page", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Other person's page", createdBy: CREATOR });
  const admin = t.withIdentity({
    subject: "user_owner",
    name: "Owner",
    o: { id: ORG, rol: "admin", slg: "acme" },
  });

  await admin.mutation(api.documents.archive, { id });

  const page = await t.run(async (ctx) => ctx.db.get("documents", id));
  expect(page?.isArchived).toBe(true);
});

test("archive requires full access", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "To trash" });
  const member = asUser(t, MEMBER);
  const creator = asUser(t, CREATOR);

  await expect(member.mutation(api.documents.archive, { id })).rejects.toThrow(
    "You don't have access to do that",
  );
  await creator.mutation(api.documents.archive, { id });

  const page = await t.run(async (ctx) => ctx.db.get("documents", id));
  expect(page?.isArchived).toBe(true);
});

test("remove deletes a page only after it is archived", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Gone soon" });
  const creator = asUser(t, CREATOR);

  await expect(creator.mutation(api.documents.remove, { id })).rejects.toThrow(
    "Move the page to trash before deleting it",
  );
  await creator.mutation(api.documents.archive, { id });
  await creator.mutation(api.documents.remove, { id });

  const page = await t.run(async (ctx) => ctx.db.get("documents", id));
  expect(page).toBeNull();
});

test("publicPage returns the shared page without a Clerk identity", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Shared out", shareToken: "token-abc" });

  const shared = await t.query(api.prosemirror.publicPage, { token: "token-abc" });
  expect(shared).toMatchObject({
    title: "Shared out",
    icon: null,
    coverUrl: null,
    snapshot: null,
  });
  expect(await t.query(api.prosemirror.publicPage, { token: "missing-token" })).toBeNull();
  expect(await t.query(api.prosemirror.publicPage, { token: id })).toBeNull();
});

test("restore throws when the save is missing and the caller can edit", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "History" });
  const member = asUser(t, MEMBER);

  await expect(member.mutation(api.prosemirror.restore, { id, version: 3 })).rejects.toThrow(
    "Save not found",
  );
});

test("fake or empty user id rejected", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "Owned" });
  const creator = asUser(t, CREATOR);

  await expect(
    creator.action(api.documents.setAccess, { id, userId: " ", level: "full" }),
  ).rejects.toThrow("Missing member");
  await expect(
    creator.action(api.documents.setAccess, {
      id,
      userId: "u".repeat(257),
      level: "full",
    }),
  ).rejects.toThrow("Invalid member");

  await creator.action(api.documents.setAccess, {
    id,
    userId: "user_fake",
    level: "full",
  });
  await expect(
    creator.action(api.documents.setAccess, { id, userId: CREATOR, level: "none" }),
  ).rejects.toThrow("The last person with full access can't be removed");
});

test("a fake user is rejected when Clerk can check membership", async () => {
  process.env.CLERK_SECRET_KEY = "test-clerk-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    const t = potionTest();
    const id = await insertPage(t, { title: "Owned" });
    const creator = asUser(t, CREATOR);
    await expect(
      creator.action(api.documents.setAccess, {
        id,
        userId: "user_fake",
        level: "full",
      }),
    ).rejects.toThrow("That person is not in this workspace");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("move into a parent the caller cannot edit is rejected", async () => {
  const t = potionTest();
  const destination = await insertPage(t, {
    title: "Locked",
    generalAccess: "view",
  });
  const page = await insertPage(t, { title: "Mine", createdBy: MEMBER });
  const member = asUser(t, MEMBER);

  await expect(
    member.mutation(api.documents.move, { id: page, parentId: destination, index: 0 }),
  ).rejects.toThrow("You don't have access to do that");
});

test("duplicate of a parent includes the child", async () => {
  const t = potionTest();
  const parent = await insertPage(t, { title: "Board", shareToken: "parent-token" });
  await insertPage(t, {
    title: "Row",
    parentId: parent,
    shareToken: "child-token",
  });
  const creator = asUser(t, CREATOR);

  const copyId = await creator.mutation(api.documents.duplicate, { id: parent });
  const copy = await t.run(async (ctx) => ctx.db.get("documents", copyId));
  expect(copy?.title).toBe("Copy of Board");
  expect(copy?.shareToken).toBeUndefined();

  const children = await t.run(async (ctx) =>
    ctx.db
      .query("documents")
      .withIndex("by_org_parent", (q) => q.eq("orgId", ORG).eq("parentId", copyId))
      .collect(),
  );
  expect(children).toHaveLength(1);
  expect(children[0]?.title).toBe("Row");
  expect(children[0]?.shareToken).toBeUndefined();
  expect(children[0]?.parentId).toBe(copyId);

  const childId = children[0]!._id;
  const grant = await t.run(async (ctx) =>
    ctx.db
      .query("access")
      .withIndex("by_document_user", (q) =>
        q.eq("documentId", childId).eq("userId", CREATOR),
      )
      .unique(),
  );
  expect(grant?.level).toBe("full");
});

test("search does not return another org", async () => {
  const t = potionTest();
  await insertPage(t, {
    orgId: "org_other",
    title: "Secret plan",
    plainText: "secret words",
  });
  const local = await insertPage(t, {
    title: "Secret plan",
    plainText: "secret words",
  });
  const member = asUser(t, MEMBER);

  const hits = await member.query(api.documents.search, { query: "Secret" });
  expect(hits.map((hit) => hit._id)).toEqual([local]);
});

test("restore rejects a view-only member", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "History", generalAccess: "view" });
  const member = asUser(t, MEMBER);

  await expect(member.mutation(api.prosemirror.restore, { id, version: 3 })).rejects.toThrow(
    "You don't have access to do that",
  );
});
