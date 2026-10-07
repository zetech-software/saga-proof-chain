import { createCertificateSubmission } from "@/lib/certificate-submission";
import { publishCertificate } from "@/lib/certificate-publisher";
import { describeActionError } from "@/lib/action-errors";
import { finalizeAdminUpload } from "@/lib/uploads.functions";
import { stagePendingUpload } from "@/lib/secure-upload";
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
  validateUploadFileDeep,
} from "@/lib/uploads";

import { RouteErrorState } from "@/components/RouteErrorState";
import { UserAccessActivity } from "@/components/UserAccessActivity";
import { PageVisitsHistory } from "@/components/PageVisitsHistory";
import { AdminAiUsagePanel } from "@/components/AdminAiUsagePanel";
import { PrivacyOverview } from "@/components/PrivacyOverview";
import { OwnershipManager } from "@/components/OwnershipManager";
import { AdminDocumentsPanel } from "@/components/AdminDocumentsPanel";
import { AdminTrademarksPanel } from "@/components/AdminTrademarksPanel";
import { AdminCertificatesPanel } from "@/components/AdminCertificatesPanel";
import { AdminSupportPanel } from "@/components/AdminSupportPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeletedItemsPanel } from "@/components/DeletedItemsPanel";
import { RestorationReviewPanel } from "@/components/RestorationReviewPanel";
import { TestCleanupPanel } from "@/components/TestCleanupPanel";

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
  const { adminCount } = useSupportNotifications();
  const certFileRef = useRef<HTMLInputElement>(null);
  const certificateSubmission = useRef(createCertificateSubmission(publishCertificate));

  const isAdmin = !!session?.isAdmin;
  const [tab, setTab] = useState("visao");

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
    network: "Ethereum (ETH) via Authora — Homologação Zé Registra",
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
      const [marcas, docs, suporte, certs, profiles] = await Promise.all([
        supabase.from("trademarks").select("*").is("deleted_at", null).order("submitted_at", { ascending: false }),
        supabase.from("documents").select("*").is("deleted_at", null).order("submitted_at", { ascending: false }),
        supabase.from("support_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("certificates").select("*").is("deleted_at", null).order("issued_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      return {
        marcas: marcas.data ?? [],
        docs: docs.data ?? [],
        suporte: suporte.data ?? [],
        certs: certs.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
    enabled: !!session?.isAdmin,
  });

  const createDoc = useMutation({
    mutationFn: async () => {
      if (newDoc.title.trim().length < 2) throw new Error("Informe o título do documento");
      const checked = await validateUploadFileDeep(newDocFile);
      if (!checked.ok) throw new Error(checked.message);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const pending = await stagePendingUpload(
        "documentos",
        checked.file,
        checked.storageName,
        checked.contentType,
      );
      const { path } = await finalizeAdminUpload({
        data: { bucket: "documentos", pendingPath: pending },
      });

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
      await certificateSubmission.current.submit({
        title: cert.title.trim(), network: cert.network || null,
        tx_hash: cert.tx_hash.trim() || null,
        verification_url: cert.verification_url.trim() || null,
        document_id: cert.document_id || null, notes: cert.notes.trim() || null,
        conclude_document: false,
      }, certFile, async () => {
        if (!certFile) return { storage_path: null, file_name: null };
        const checked = await validateUploadFileDeep(certFile);
        if (!checked.ok) throw new Error(checked.message);
        const pending = await stagePendingUpload("certificados", checked.file, checked.storageName, checked.contentType);
        const { path } = await finalizeAdminUpload({ data: { bucket: "certificados", pendingPath: pending } });
        return { storage_path: path, file_name: checked.displayName };
      });
    },
    onSuccess: () => {
      toast.success("Certificado publicado no portal");
      setCert({
        title: "",
        network: "Ethereum (ETH) via Authora — Homologação Zé Registra",
        tx_hash: "",
        verification_url: "",
        document_id: "",
        notes: "",
      });
      setCertFile(null);
      if (certFileRef.current) certFileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    },
    onError: (e: unknown) => {
      toast.error(describeActionError(e, "Não foi possível confirmar o certificado. Atualize a lista antes de repetir."));
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    },
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

  // Contadores consideram só documentos ativos (arquivados não pedem ação).
  const docs = (data?.docs ?? []).filter((d) => !d.archived_at);
  const suporte = data?.suporte ?? [];
  const pend = {
    recebidos: docs.filter((d) => d.status === "recebido" && !d.is_additional).length,
    adicionais: docs.filter((d) => d.status === "recebido" && d.is_additional).length,
    aguardando: docs.filter((d) => d.status === "aguardando_documentacao").length,
    semCert: docs.filter(
      (d) => d.status === "concluido" && !(data?.certs ?? []).some((c) => c.document_id === d.id),
    ).length,
    chamados: suporte.filter((s) => s.status === "aberta").length,
  };
  const attention = [
    { label: "Documentos recebidos", value: pend.recebidos, tab: "processos" },
    { label: "Envios adicionais", value: pend.adicionais, tab: "processos" },
    { label: "Aguardando documentação do cliente", value: pend.aguardando, tab: "processos" },
    { label: "Concluídos sem certificado", value: pend.semCert, tab: "processos" },
    { label: "Chamados aguardando resposta", value: pend.chamados, tab: "atendimento" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-gold">Administração</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O que precisa de atenção hoje, atendimento e gestão dos processos.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="atendimento">
            Atendimento{adminCount > 0 ? ` (${adminCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="processos">Processos</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="controle">Controle</TabsTrigger>
          <TabsTrigger value="excluidos">Excluídos</TabsTrigger>
          <TabsTrigger value="recuperacao">Recuperação</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => setTab(a.tab)}
                className={`rounded-xl border p-4 text-left transition-colors hover:border-brand-hover/50 ${
                  a.value > 0 ? "border-brand-hover/40 bg-brand-hover/5" : "border-border/60 bg-card/60"
                }`}
              >
                <p className="text-3xl font-semibold">{data ? a.value : "—"}</p>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{a.label}</p>
              </button>
            ))}
          </div>
          {pend.chamados > 0 && (
            <Button variant="outline" onClick={() => setTab("atendimento")}>
              Responder chamados pendentes
            </Button>
          )}
        </TabsContent>

        <TabsContent value="atendimento">
          <AdminSupportPanel requests={suporte as never} profiles={data?.profiles ?? []} />
        </TabsContent>

        <TabsContent value="processos" className="space-y-6">
          <AdminDocumentsPanel
            docs={(data?.docs ?? []) as never}
            enabled={isAdmin}
            adminUserId={session?.user?.id ?? null}
          />
          <AdminCertificatesPanel
            certs={(data?.certs ?? []) as never}
            docs={docs.map((d) => ({ id: d.id, label: d.title }))}
            marcas={(data?.marcas ?? []).map((m) => ({ id: m.id, label: m.name }))}
            enabled={isAdmin}
            adminUserId={session?.user?.id ?? null}
          />
          <AdminTrademarksPanel marcas={(data?.marcas ?? []) as never} enabled={isAdmin} />
          <details className="group rounded-xl border border-border/60 bg-card/40 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Cadastrar documento, marca ou certificado
            </summary>
            <div className="mt-4 space-y-6">
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
            </div>
          </details>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          <UserAccessActivity enabled={isAdmin} docs={data?.docs} marcas={data?.marcas} suporte={data?.suporte} />
          <OwnershipManager enabled={isAdmin} />
        </TabsContent>

        <TabsContent value="controle" className="space-y-6">
          <AdminAiUsagePanel enabled={isAdmin} />
          <PageVisitsHistory enabled={isAdmin} />
          <PrivacyOverview enabled={isAdmin} />
        </TabsContent>

        <TabsContent value="excluidos" className="space-y-6">
          <DeletedItemsPanel enabled={isAdmin} />
        </TabsContent>

        <TabsContent value="recuperacao" className="space-y-6">
          <RestorationReviewPanel enabled={isAdmin} />
          <TestCleanupPanel enabled={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
