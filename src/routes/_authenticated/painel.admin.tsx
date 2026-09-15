import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { useSupportNotifications } from "@/hooks/useSupportNotifications";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABEL,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  TRADEMARK_STATUSES,
  TRADEMARK_STATUS_LABEL,
  formatDateTime,
  formatBytes,
} from "@/lib/portal";
import {
  ACCEPT_ATTRIBUTE,
  UPLOAD_HELP_TEXT,
  describeUploadError,
  validateUploadFile,
} from "@/lib/uploads";

import { RouteErrorState } from "@/components/RouteErrorState";
import { UserAccessActivity } from "@/components/UserAccessActivity";
import { PageVisitsHistory } from "@/components/PageVisitsHistory";
import { PrivacyOverview } from "@/components/PrivacyOverview";
import { OwnershipManager } from "@/components/OwnershipManager";
import { AdminDocumentsPanel } from "@/components/AdminDocumentsPanel";
import { AdminTrademarksPanel } from "@/components/AdminTrademarksPanel";
import { AdminCertificatesPanel } from "@/components/AdminCertificatesPanel";


export const Route = createFileRoute("/_authenticated/painel/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Torre de Registros | Saga Mitologia Cósmica" },
      {
        name: "description",
        content: "Painel interno Zé Registra para atualizar status e emitir certificados.",
      },
      {
        property: "og:title",
        content: "Administração — Torre de Registros | Saga Mitologia Cósmica",
      },
      { property: "og:description", content: "Gestão interna dos registros." },
    ],
  }),
  errorComponent: RouteErrorState,
  component: AdminPage,
});

function AdminPage() {
  const { data: session, isLoading } = usePortalSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { adminCount, unreadIdFor, markRead, markAllRead } = useSupportNotifications();
  const certFileRef = useRef<HTMLInputElement>(null);

  const isAdmin = !!session?.isAdmin;

  // Sem cargo admin: mesmo comportamento da rota de Suporte (redireciona).
  useEffect(() => {
    if (isLoading || isAdmin) return;
    navigate({ to: "/painel", replace: true });
  }, [isAdmin, isLoading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-support-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_requests" }, () =>
        queryClient.invalidateQueries({ queryKey: ["admin-data"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient]);

  const [cert, setCert] = useState({
    title: "",
    network: "Polygon",
    tx_hash: "",
    verification_url: "",
    document_id: "",
    notes: "",
  });
  const [certFile, setCertFile] = useState<File | null>(null);

  function pickFile(
    selected: File | null,
    setter: (f: File | null) => void,
    ref: { current: HTMLInputElement | null },
  ) {
    if (!selected) {
      setter(null);
      return;
    }
    const result = validateUploadFile(selected);
    if (!result.ok) {
      toast.error(result.message);
      setter(null);
      if (ref.current) ref.current.value = "";
      return;
    }
    setter(selected);
  }

  const newDocFileRef = useRef<HTMLInputElement>(null);
  const [newDoc, setNewDoc] = useState({ title: "", description: "" });
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [newMarca, setNewMarca] = useState({
    name: "",
    holder: "",
    nice_class: "",
    segment: "",
    notes: "",
  });

  // Organização titular padrão (Saga) para novos cadastros feitos pelo admin.
  const { data: defaultOrgId } = useQuery({
    queryKey: ["default-organization"],
    enabled: !!session?.isAdmin,
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", "saga-mitologia-cosmica")
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  const { data } = useQuery({
    queryKey: ["admin-data"],
    queryFn: async () => {
      const [marcas, docs, suporte, certs] = await Promise.all([
        supabase.from("trademarks").select("*").order("submitted_at", { ascending: false }),
        supabase.from("documents").select("*").order("submitted_at", { ascending: false }),
        supabase.from("support_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("certificates").select("*").order("issued_at", { ascending: false }),
      ]);
      return {
        marcas: marcas.data ?? [],
        docs: docs.data ?? [],
        suporte: suporte.data ?? [],
        certs: certs.data ?? [],
      };
    },
    enabled: !!session?.isAdmin,
  });

  const createDoc = useMutation({
    mutationFn: async () => {
      if (newDoc.title.trim().length < 2) throw new Error("Informe o título do documento");
      const checked = validateUploadFile(newDocFile);
      if (!checked.ok) throw new Error(checked.message);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const path = `${userId}/${checked.storageName}`;
      const { error: upErr } = await supabase.storage
        .from("documentos")
        .upload(path, checked.file, { contentType: checked.contentType, upsert: false });
      if (upErr) throw upErr;

      const { error } = await supabase.from("documents").insert({
        title: newDoc.title.trim(),
        description: newDoc.description.trim() || null,
        storage_path: path,
        file_name: checked.displayName,
        file_size: checked.file.size,
        mime_type: checked.contentType,
        created_by: userId,
        organization_id: defaultOrgId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento cadastrado");
      setNewDoc({ title: "", description: "" });
      setNewDocFile(null);
      if (newDocFileRef.current) newDocFileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: unknown) => toast.error(describeUploadError(e)),
  });

  const createMarca = useMutation({
    mutationFn: async () => {
      if (newMarca.name.trim().length < 2) throw new Error("Informe o nome da marca");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const { error } = await supabase.from("trademarks").insert({
        name: newMarca.name.trim(),
        holder: newMarca.holder.trim() || null,
        nice_class: newMarca.nice_class.trim() || null,
        segment: newMarca.segment.trim() || null,
        notes: newMarca.notes.trim() || null,
        created_by: userId,
        organization_id: defaultOrgId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marca cadastrada");
      setNewMarca({ name: "", holder: "", nice_class: "", segment: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
      queryClient.invalidateQueries({ queryKey: ["trademarks"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar marca"),
  });

  const updateSupport = useMutation({
    mutationFn: async (input: { id: string; status?: string; admin_reply?: string }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("support_requests").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação atualizada");
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
    },
    onError: () => toast.error("Erro ao atualizar solicitação"),
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
        const checked = validateUploadFile(certFile);
        if (!checked.ok) throw new Error(checked.message);
        const path = `certificados/${checked.storageName}`;
        const { error: upErr } = await supabase.storage
          .from("certificados")
          .upload(path, checked.file, { contentType: checked.contentType, upsert: false });
        if (upErr) throw upErr;
        storage_path = path;
        file_name = checked.displayName;
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
    onError: (e: unknown) => toast.error(describeUploadError(e)),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!isAdmin) {
    return (
      <Card className="bg-card/70">
        <CardContent className="px-6 py-8 text-sm text-muted-foreground">
          Área restrita à equipe Zé Registra. Redirecionando...
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

      <section className="space-y-4" aria-labelledby="usuarios-privacidade">
        <h2 id="usuarios-privacidade" className="font-display text-xl text-gold-light">
          Usuários e privacidade
        </h2>
        <UserAccessActivity
          enabled={isAdmin}
          docs={data?.docs}
          marcas={data?.marcas}
          suporte={data?.suporte}
        />
        <PageVisitsHistory enabled={isAdmin} />
        <OwnershipManager enabled={isAdmin} />

        <PrivacyOverview enabled={isAdmin} />

      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Cadastrar documento</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createDoc.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="ndtitle">Título *</Label>
                <Input
                  id="ndtitle"
                  value={newDoc.title}
                  maxLength={160}
                  onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nddesc">Descrição</Label>
                <Textarea
                  id="nddesc"
                  value={newDoc.description}
                  maxLength={1000}
                  onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ndfile">Arquivo *</Label>
                <Input
                  id="ndfile"
                  type="file"
                  ref={newDocFileRef}
                  accept={ACCEPT_ATTRIBUTE}
                  aria-describedby="ndfile-help"
                  onChange={(e) =>
                    pickFile(e.target.files?.[0] ?? null, setNewDocFile, newDocFileRef)
                  }
                />
                <p id="ndfile-help" className="text-xs text-muted-foreground">
                  {UPLOAD_HELP_TEXT}
                </p>
                {newDocFile && (
                  <p className="break-all text-xs text-foreground">
                    Selecionado: {newDocFile.name} · {formatBytes(newDocFile.size)}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={createDoc.isPending || !newDocFile}
                aria-busy={createDoc.isPending}
              >
                {createDoc.isPending ? "Enviando arquivo..." : "Cadastrar documento"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Cadastrar marca</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createMarca.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="nmname">Nome da marca *</Label>
                <Input
                  id="nmname"
                  value={newMarca.name}
                  maxLength={160}
                  onChange={(e) => setNewMarca({ ...newMarca, name: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nmholder">Titular</Label>
                  <Input
                    id="nmholder"
                    value={newMarca.holder}
                    maxLength={160}
                    onChange={(e) => setNewMarca({ ...newMarca, holder: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nmclass">Classe</Label>
                  <Input
                    id="nmclass"
                    value={newMarca.nice_class}
                    maxLength={80}
                    onChange={(e) => setNewMarca({ ...newMarca, nice_class: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nmseg">Segmento</Label>
                <Input
                  id="nmseg"
                  value={newMarca.segment}
                  maxLength={160}
                  onChange={(e) => setNewMarca({ ...newMarca, segment: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nmnotes">Observações</Label>
                <Textarea
                  id="nmnotes"
                  value={newMarca.notes}
                  maxLength={1000}
                  onChange={(e) => setNewMarca({ ...newMarca, notes: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={createMarca.isPending}>
                {createMarca.isPending ? "Cadastrando..." : "Cadastrar marca"}
              </Button>
            </form>
          </CardContent>
        </Card>
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
                accept={ACCEPT_ATTRIBUTE}
                aria-describedby="cfile-help"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null, setCertFile, certFileRef)}
              />
              <p id="cfile-help" className="text-xs text-muted-foreground">
                {UPLOAD_HELP_TEXT}
              </p>
              {certFile && (
                <p className="break-all text-xs text-foreground">
                  Selecionado: {certFile.name} · {formatBytes(certFile.size)}
                </p>
              )}
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
              <Button
                type="submit"
                disabled={createCert.isPending}
                aria-busy={createCert.isPending}
              >
                {createCert.isPending ? "Publicando..." : "Publicar certificado"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AdminDocumentsPanel
        docs={(data?.docs ?? []) as never}
        enabled={isAdmin}
        adminUserId={session?.user?.id ?? null}
      />

      <AdminTrademarksPanel marcas={(data?.marcas ?? []) as never} enabled={isAdmin} />


      <Card className="bg-card/70">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Solicitações de suporte</CardTitle>
          {adminCount > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {adminCount}{" "}
                {adminCount === 1
                  ? "chamado novo não visualizado"
                  : "chamados novos não visualizados"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate("new_support_request")}
                disabled={markAllRead.isPending}
                aria-busy={markAllRead.isPending}
              >
                Marcar todas como lidas
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {(data?.suporte ?? []).map((s) => {
            const unreadId = unreadIdFor("new_support_request", s.id);
            return (
              <div
                key={s.id}
                className={`rounded-lg border p-4 ${
                  unreadId ? "border-brand-hover/50 bg-brand-hover/5" : "border-border/60"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">{s.subject}</p>
                  {unreadId && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-brand-hover/40 bg-brand-hover/10 px-3 py-1 text-xs text-brand-hover">
                        Não visualizado
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markRead.mutate(unreadId)}
                        disabled={markRead.isPending}
                        aria-label={`Marcar chamado ${s.subject} como visualizado`}
                      >
                        Marcar como visualizado
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(s.created_at)}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {s.message}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Select
                    value={s.status}
                    onValueChange={(v) => updateSupport.mutate({ id: s.id, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_STATUSES.map((st) => (
                        <SelectItem key={st} value={st}>
                          {SUPPORT_STATUS_LABEL[st]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    defaultValue={s.admin_reply ?? ""}
                    placeholder="Resposta ao cliente"
                    maxLength={2000}
                    onFocus={() => unreadId && markRead.mutate(unreadId)}
                    onBlur={(e) =>
                      e.target.value !== (s.admin_reply ?? "") &&
                      updateSupport.mutate({ id: s.id, admin_reply: e.target.value })
                    }
                  />
                </div>
              </div>
            );
          })}
          {!data?.suporte.length && (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação enviada ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
