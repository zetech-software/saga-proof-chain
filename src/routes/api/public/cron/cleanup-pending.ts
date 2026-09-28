import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function authorized(header: string | null) {
  const secret = process.env["CRON_SECRET"];
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/cron/cleanup-pending")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request.headers.get("x-cron-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = Date.now() - MAX_AGE_MS;
        let removed = 0;
        for (const bucket of ["documentos", "certificados"] as const) {
          const store = supabaseAdmin.storage.from(bucket);
          const { data: owners } = await store.list("", { limit: 1000 });
          for (const owner of owners ?? []) {
            if (owner.id) continue; // files at root, not user folders
            const prefix = `${owner.name}/pending`;
            const { data: items } = await store.list(prefix, { limit: 1000 });
            const stale = (items ?? [])
              .filter((i) => i.id && new Date(i.created_at).getTime() < cutoff)
              .map((i) => `${prefix}/${i.name}`);
            if (stale.length) {
              await store.remove(stale);
              removed += stale.length;
            }
          }
        }
        return Response.json({ removed });
      },
    },
  },
});
