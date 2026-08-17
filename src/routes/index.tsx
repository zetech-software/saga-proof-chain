import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, ShieldCheck, Stamp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PoweredBy } from "@/components/PoweredBy";
import { SagaLogo } from "@/components/SagaLogo";

import { PRAZO_TEXTO } from "@/lib/portal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Torre de Registros — Saga Mitologia Cósmica" },
      {
        name: "description",
        content:
          "Portal exclusivo da Saga Mitologia Cósmica para registro de marcas, documentos e certificados em blockchain, por Zé Registra.",
      },
      { property: "og:title", content: "Torre de Registros — Saga Mitologia Cósmica" },
      {
        property: "og:description",
        content: "Marcas, documentos e certificados blockchain em um só lugar, em tempo real.",
      },
    ],
  }),
  component: Home,
});

const features = [
  {
    icon: Stamp,
    title: "Registro de marcas",
    text: "Submeta as marcas da saga e acompanhe cada etapa do pedido de registro.",
  },
  {
    icon: FileText,
    title: "Documentos",
    text: `Envie documentos para registro em blockchain. Prazo médio de ${PRAZO_TEXTO}.`,
  },
  {
    icon: ShieldCheck,
    title: "Certificados",
    text: "Certificados atualizados em tempo real, com hash e verificação pública.",
  },
];

function Home() {
  return (
    <div className="starfield flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
        <p className="text-xs uppercase tracking-[0.4em] text-primary">Acesso exclusivo</p>
        <SagaLogo className="mt-6 h-28 sm:h-40" />
        <h1 className="mt-4 font-display text-3xl leading-tight text-gold sm:text-4xl">
          <span className="sr-only">Saga Mitologia Cósmica — </span>
          <span className="font-serif text-2xl text-foreground sm:text-3xl">
            Torre de Registros
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-base text-muted-foreground">
          Acompanhe marcas, documentos e certificados de registro em blockchain da saga, em tempo
          real, com consulta direta às fontes oficiais.
        </p>

        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/auth">Entrar no portal</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/70 bg-card/60 p-6 backdrop-blur"
            >
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-serif text-lg">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border/60 py-8">
        <PoweredBy />
      </footer>
    </div>
  );
}
