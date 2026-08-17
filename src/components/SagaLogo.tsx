import sagaLogo from "@/assets/saga-logo.avif.asset.json";

export function SagaLogo({ className = "h-12" }: { className?: string }) {
  return (
    <img
      src={sagaLogo.url}
      alt="Saga Mitologia Cósmica"
      className={`w-auto object-contain ${className}`}
      loading="lazy"
    />
  );
}
