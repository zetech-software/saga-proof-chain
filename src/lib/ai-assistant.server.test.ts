import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AI_CONTEXT_LIMIT, buildContext, extractRefs } from "./ai-assistant.server";

function client(rows: Record<string, unknown[]>) {
  const limits: number[] = [];
  const supabase = {
    from: vi.fn((table: string) => {
      const query = {
        select: () => query,
        order: () => query,
        limit: (n: number) => {
          limits.push(n);
          return Promise.resolve({ data: (rows[table] ?? []).slice(0, n), error: null });
        },
      };
      return query;
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient<Database>, limits };
}

describe("assistant context completeness", () => {
  it("warns about omitted records and limits authorized references", async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ id: String(i), title: `Certificate ${i}`, notes: null }));
    const { supabase, limits } = client({ certificates: rows });
    const result = await buildContext(supabase, "caller", new Set(["certificados"]));
    expect(limits).toEqual([AI_CONTEXT_LIMIT + 1, AI_CONTEXT_LIMIT + 1]);
    expect(result.text).toContain("CONTEXTO PARCIAL");
    expect(result.text).toContain("CERTIFICADOS (30)");
    expect(result.refs.size).toBe(30);
    expect(result.refs.has("C31")).toBe(false);
  });
  it("does not warn for exactly 30 records", async () => {
    const { supabase } = client({ trademarks: Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: `Brand ${i}`, status: "submetida" })) });
    const result = await buildContext(supabase, "caller", new Set(["marcas"]));
    expect(result.text).not.toContain("CONTEXTO PARCIAL");
    expect(result.refs.size).toBe(30);
  });
  it("does not authorize references invented by the model", () => {
    const refs = new Map([["C1", { kind: "certificate" as const, id: "visible", label: "Visible" }]]);
    expect(extractRefs("Resposta\nFONTES: C1 C31", refs).links).toEqual([refs.get("C1")]);
  });
});
