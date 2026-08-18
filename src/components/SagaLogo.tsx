import sagaLogo400 from "@/assets/saga-logo-400.webp";
import sagaLogo800 from "@/assets/saga-logo-800.webp";
import sagaLogoFallback from "@/assets/saga-logo-fallback.png";

export function SagaLogo({ className = "h-12" }: { className?: string }) {
  return (
    <picture>
      <source
        type="image/webp"
        srcSet={`${sagaLogo400} 400w, ${sagaLogo800} 800w`}
        sizes="(max-width: 640px) 240px, 400px"
      />
      <img
        src={sagaLogoFallback}
        alt="Saga Mitologia Cósmica"
        width={1402}
        height={988}
        className={`w-auto object-contain ${className}`}
        loading="lazy"
      />
    </picture>
  );
}
