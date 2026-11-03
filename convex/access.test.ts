import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import componentSchema from "./components/prosemirrorSync/schema";
import schema from "./schema";
import { modules, prosemirrorModules } from "./test.setup";

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
  } = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("documents", {
      orgId: fields.orgId ?? ORG,
      parentId: null,
      title: fields.title ?? "Notes",
      icon: null,
      coverUrl: null,
      isArchived: false,
      position: 0,
      createdBy: fields.createdBy ?? CREATOR,
      updatedAt: 1,
      plainText: fields.plainText ?? "",
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

  await creator.mutation(api.documents.setAccess, {
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

test("restore rejects a view-only member", async () => {
  const t = potionTest();
  const id = await insertPage(t, { title: "History", generalAccess: "view" });
  const member = asUser(t, MEMBER);

  await expect(member.mutation(api.prosemirror.restore, { id, version: 3 })).rejects.toThrow(
    "You don't have access to do that",
  );
});
