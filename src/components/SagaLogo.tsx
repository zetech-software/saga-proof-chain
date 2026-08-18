import sagaLogo from "@/assets/saga-logo-transparent.png";

export function SagaLogo({ className = "h-12" }: { className?: string }) {
  return (
    <img
      src={sagaLogo}
      alt="Saga Mitologia Cósmica"
      className={`w-auto object-contain ${className}`}
      loading="lazy"
    />
  );
}
