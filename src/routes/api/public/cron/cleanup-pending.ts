import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/cron/cleanup-pending")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("x-cron-secret");
        if (!header || header.length < 32) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("internal_config")
          .select("value")
          .eq("key", "cleanup_pending_token")
          .maybeSingle();
        const envSecret = process.env["CRON_SECRET"];
        const ok = (cfg?.value && same(header, cfg.value)) || (envSecret && same(header, envSecret));
        if (!ok) return new Response("Unauthorized", { status: 401 });

        const cutoff = Date.now() - MAX_AGE_MS;
        let removed = 0;
        for (const bucket of ["documentos", "certificados"] as const) {
          const store = supabaseAdmin.storage.from(bucket);
          const { data: owners } = await store.list("", { limit: 1000 });
          for (const owner of owners ?? []) {
            if (owner.id) continue; // root-level files, not user folders
            const prefix = `${owner.name}/pending`;
            const { data: items } = await store.list(prefix, { limit: 1000 });
            const stale = (items ?? [])
              .filter((i) => i.id && new Date(i.created_at ?? 0).getTime() < cutoff)
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
