import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortalSession } from "@/hooks/usePortalSession";
import {
  DOCUMENT_STATUS,
  DOCUMENT_STATUS_LABEL,
  TRADEMARK_STATUS,
  TRADEMARK_STATUS_LABEL,
} from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/painel/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Portal Saga Mitologia Cósmica" },
      {
        name: "description",
        content: "Painel interno Zé Registra para atualizar status e emitir certificados.",
      },
      { property: "og:title", content: "Administração — Portal Saga Mitologia Cósmica" },
      { property: "og:description", content: "Gestão interna dos registros." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { data: session, isLoading } = usePortalSession();
  const queryClient = useQueryClient();
  const certFileRef = useRef<HTMLInputElement>(null);

  const [cert, setCert] = useState({
    title: "",
    network: "Polygon",
    tx_hash: "",
    verification_url: "",
    document_id: "",
    notes: "",
  });
  const [certFile, setCertFile] = useState<File | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-data"],
    queryFn: async () => {
      const [marcas, docs] = await Promise.all([
        supabase.from("trademarks").select("*").order("submitted_at", { ascending: false }),
        supabase.from("documents").select("*").order("submitted_at", { ascending: false }),
      ]);
      return { marcas: marcas.data ?? [], docs: docs.data ?? [] };
    },
    enabled: !!session?.isAdmin,
  });

  const updateDoc = useMutation({
    mutationFn: async (input: { id: string; status?: string; admin_notes?: string }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("documents").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento atualizado");
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    },
    onError: () => toast.error("Erro ao atualizar documento"),
  });

  const updateMarca = useMutation({
    mutationFn: async (input: {
      id: string;
      status?: string;
      admin_notes?: string;
      protocol_number?: string;
    }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("trademarks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marca atualizada");
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    },
    onError: () => toast.error("Erro ao atualizar marca"),
  });

  const createCert = useMutation({
    mutationFn: async () => {
      if (cert.title.trim().length < 2) throw new Error("Informe o título do certificado");
      let storage_path: string | null = null;
      let file_name: string | null = null;
      if (certFile) {
        const safeName = certFile.name.replace(/[^\w.\-]/g, "_");
        const path = `certificados/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("certificados")
          .upload(path, certFile);
        if (upErr) throw upErr;
        storage_path = path;
        file_name = certFile.name;
      }
      const { error } = await supabase.from("certificates").insert({
        title: cert.title.trim(),
        network: cert.network || null,
        tx_hash: cert.tx_hash.trim() || null,
        verification_url: cert.verification_url.trim() || null,
        document_id: cert.document_id || null,
        notes: cert.notes.trim() || null,
        storage_path,
        file_name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificado publicado no portal");
      setCert({
        title: "",
        network: "Polygon",
        tx_hash: "",
        verification_url: "",
        document_id: "",
        notes: "",
      });
      setCertFile(null);
      if (certFileRef.current) certFileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao publicar certificado"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!session?.isAdmin) {
    return (
      <Card className="bg-card/70">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Área restrita à equipe Zé Registra.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-gold">Administração</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Atualize status e publique certificados — os clientes veem em tempo real.
        </p>
      </div>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-lg">Publicar certificado blockchain</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createCert.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="ctitle">Título *</Label>
              <Input
                id="ctitle"
                value={cert.title}
                maxLength={160}
                onChange={(e) => setCert({ ...cert, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnet">Rede</Label>
              <Input
                id="cnet"
                value={cert.network}
                maxLength={60}
                onChange={(e) => setCert({ ...cert, network: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctx">Hash da transação</Label>
              <Input
                id="ctx"
                value={cert.tx_hash}
                maxLength={200}
                onChange={(e) => setCert({ ...cert, tx_hash: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="curl">URL de verificação</Label>
              <Input
                id="curl"
                value={cert.verification_url}
                maxLength={500}
                onChange={(e) => setCert({ ...cert, verification_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cdoc">Documento vinculado</Label>
              <Select
                value={cert.document_id}
                onValueChange={(v) => setCert({ ...cert, document_id: v })}
              >
                <SelectTrigger id="cdoc">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.docs ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfile">Arquivo do certificado</Label>
              <Input
                id="cfile"
                type="file"
                ref={certFileRef}
                onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cnotes">Observações</Label>
              <Textarea
                id="cnotes"
                value={cert.notes}
                maxLength={1000}
                onChange={(e) => setCert({ ...cert, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createCert.isPending}>
                {createCert.isPending ? "Publicando..." : "Publicar certificado"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-lg">Documentos na esteira</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(data?.docs ?? []).map((d) => (
            <div key={d.id} className="rounded-lg border border-border/60 p-4">
              <p className="font-medium">{d.title}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Select
                  value={d.status}
                  onValueChange={(v) => updateDoc.mutate({ id: d.id, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DOCUMENT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  defaultValue={d.admin_notes ?? ""}
                  placeholder="Nota para o cliente"
                  maxLength={1000}
                  onBlur={(e) =>
                    e.target.value !== (d.admin_notes ?? "") &&
                    updateDoc.mutate({ id: d.id, admin_notes: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
          {!data?.docs.length && (
            <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-lg">Marcas submetidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(data?.marcas ?? []).map((m) => (
            <div key={m.id} className="rounded-lg border border-border/60 p-4">
              <p className="font-medium">{m.name}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Select
                  value={m.status}
                  onValueChange={(v) => updateMarca.mutate({ id: m.id, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADEMARK_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {TRADEMARK_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  defaultValue={m.protocol_number ?? ""}
                  placeholder="Nº de protocolo"
                  maxLength={80}
                  onBlur={(e) =>
                    e.target.value !== (m.protocol_number ?? "") &&
                    updateMarca.mutate({ id: m.id, protocol_number: e.target.value })
                  }
                />
                <Input
                  defaultValue={m.admin_notes ?? ""}
                  placeholder="Nota para o cliente"
                  maxLength={1000}
                  onBlur={(e) =>
                    e.target.value !== (m.admin_notes ?? "") &&
                    updateMarca.mutate({ id: m.id, admin_notes: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
          {!data?.marcas.length && (
            <p className="text-sm text-muted-foreground">Nenhuma marca submetida.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
