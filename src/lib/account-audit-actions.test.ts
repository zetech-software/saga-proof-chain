import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../drizzle/migrations/0020_allow_account_lifecycle_audit_actions.sql", import.meta.url),
  "utf8",
);
const allowed = [...migration.matchAll(/'([^']+)'::text/g)].map(match => match[1]);

describe("account audit action constraint", () => {
  it("allows recording account deletion", () => {
    expect(allowed).toContain("account_deleted");
  });
  it("allows recording account creation", () => {
    expect(allowed).toContain("account_created");
  });
  it("allows recording a temporary-password reset", () => {
    expect(allowed).toContain("password_reset");
  });
  it("retains all existing audit actions without allowing arbitrary actions", () => {
    expect(allowed).toEqual([
      "role_changed", "member_added", "member_removed", "organization_created",
      "organization_updated", "profile_updated", "password_reset", "account_created", "account_deleted",
    ]);
    expect(allowed).not.toContain("unknown_action");
  });
});