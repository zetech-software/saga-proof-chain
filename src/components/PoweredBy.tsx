import zeRegistra from "@/assets/ze-registra.png.asset.json";

export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Powered by</span>
      <img
        src={zeRegistra.url}
        alt="Zé Registra"
        className="h-16 w-auto object-contain sm:h-20"
        loading="lazy"
      />
    </div>
  );
}
