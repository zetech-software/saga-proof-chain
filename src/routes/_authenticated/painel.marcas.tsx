import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { TRADEMARK_STATUS_LABEL, formatDate } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/painel/marcas")({
  head: () => ({
    meta: [
      { title: "Registro de marcas — Portal Saga Mitologia Cósmica" },
      {
        name: "description",
        content: "Submeta novas marcas e acompanhe o andamento de cada pedido de registro.",
      },
      { property: "og:title", content: "Registro de marcas — Saga Mitologia Cósmica" },
      { property: "og:description", content: "Submissão e acompanhamento de pedidos de marca." },
    ],
  }),
  component: MarcasPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome da marca").max(160),
  holder: z.string().trim().max(160).optional(),
  nice_class: z.string().trim().max(60).optional(),
  segment: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function MarcasPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    holder: "",
    nice_class: "",
    segment: "",
    notes: "",
  });

  const { data: marcas } = useQuery({
    queryKey: ["trademarks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trademarks")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("trademarks").insert({
        name: parsed.name,
        holder: parsed.holder || null,
        nice_class: parsed.nice_class || null,
        segment: parsed.segment || null,
        notes: parsed.notes || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marca submetida com sucesso!");
      setForm({ name: "", holder: "", nice_class: "", segment: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["trademarks"] });
    },
    onError: (e: unknown) => {
      const message =
        e instanceof z.ZodError ? (e.issues[0]?.message ?? "Dados inválidos") : "Erro ao submeter";
      toast.error(message);
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-gold">Registro de marcas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Submeta as marcas que devem entrar no processo de registro e acompanhe o status.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Nova marca</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">Nome da marca *</Label>
                <Input
                  id="name"
                  value={form.name}
                  maxLength={160}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Saga Mitologia Cósmica"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holder">Titular</Label>
                <Input
                  id="holder"
                  value={form.holder}
                  maxLength={160}
                  onChange={(e) => setForm({ ...form, holder: e.target.value })}
                  placeholder="Pessoa física ou jurídica"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="nice">Classe</Label>
                  <Input
                    id="nice"
                    value={form.nice_class}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, nice_class: e.target.value })}
                    placeholder="Ex.: 41"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="segment">Segmento</Label>
                  <Input
                    id="segment"
                    value={form.segment}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, segment: e.target.value })}
                    placeholder="Ex.: Editorial"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Detalhes relevantes sobre a marca"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Enviando..." : "Submeter marca"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {(marcas ?? []).map((m) => (
            <Card key={m.id} className="bg-card/70">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl">{m.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Submetida em {formatDate(m.submitted_at)}
                      {m.protocol_number ? ` · Protocolo ${m.protocol_number}` : ""}
                    </p>
                  </div>
                  <StatusBadge
                    status={m.status}
                    label={TRADEMARK_STATUS_LABEL[m.status] ?? m.status}
                  />
                </div>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <p>
                    <span className="text-muted-foreground">Titular: </span>
                    {m.holder ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Classe: </span>
                    {m.nice_class ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Segmento: </span>
                    {m.segment ?? "—"}
                  </p>
                </div>
                {m.notes && <p className="mt-3 text-sm text-muted-foreground">{m.notes}</p>}
                {m.admin_notes && (
                  <p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="text-primary">Zé Registra: </span>
                    {m.admin_notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {!marcas?.length && (
            <Card className="bg-card/70">
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Nenhuma marca submetida ainda.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
