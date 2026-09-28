import { createFileRoute } from "@tanstack/react-router";
// TEMPORÁRIO: remove as duas contas de teste identificadas por id. Apagar após uso.
const IDS = ["f91ec327-273a-4ad0-807a-ffe30d07b86f", "c2ccee3f-560e-4b68-a5b3-d13f89141253"];
export const Route = createFileRoute("/api/public/tmp-cleanup-x9")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-token") !== "6d4df8572495c03015656e74dde85b03100fe0ccfe948e02") return new Response("no", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const out: Record<string, unknown> = {};
        for (const bucket of ["documentos", "certificados"]) {
          for (const id of IDS) {
            for (const dir of [id, id + "/pending"]) {
              const { data } = await supabaseAdmin.storage.from(bucket).list(dir, { limit: 1000 });
              const files = (data ?? []).filter((f) => f.id).map((f) => dir + "/" + f.name);
              if (files.length) {
                const r = await supabaseAdmin.storage.from(bucket).remove(files);
                out[bucket + ":" + dir] = r.error ? r.error.message : files.length;
              }
            }
          }
        }
        for (const id of IDS) {
          const r = await supabaseAdmin.auth.admin.deleteUser(id);
          out["user:" + id.slice(0, 8)] = r.error ? r.error.message : "removido";
        }
        return Response.json(out);
      },
    },
  },
});
