import { describe, expect, it } from "vitest";
import { isAccountAdmin, mayDemote, type AccessAccount } from "./admin-access";
const admin: AccessAccount = { id: "admin", name: "Admin", email: null, roles: ["admin", "cliente"] };
const other: AccessAccount = { ...admin, id: "other" };
describe("administrative access affordances", () => {
  it("recognizes admin even when the account also has the client role", () => { expect(isAccountAdmin(admin)).toBe(true); });
  it("keeps the last administrator protected", () => { expect(mayDemote(admin, "other", [admin])).toBe(false); });
  it("prevents self-demotion with more than one admin", () => { expect(mayDemote(admin, "admin", [admin, other])).toBe(false); });
  it("allows another administrator to be changed to client", () => { expect(mayDemote(other, "admin", [admin, other])).toBe(true); });
  it("does not offer demotion for a client", () => { expect(mayDemote({ ...other, roles: ["cliente"] }, "admin", [admin, other])).toBe(false); });
});
