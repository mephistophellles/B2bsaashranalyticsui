import { useState } from "react";
import logoLight from "@/assets/brand/potencore-logo-light.png";
import logoDark from "@/assets/brand/potencore-logo-dark.png";
import iconLogo from "@/assets/brand/potencore-icon.png";

type BrandMarkTone = "light" | "dark";
type BrandMarkVariant = "sidebar" | "auth" | "landing" | "icon";

type BrandMarkProps = {
  tone?: BrandMarkTone;
  variant?: BrandMarkVariant;
  className?: string;
};

export default function BrandMark({ tone = "light", variant = "sidebar", className = "" }: BrandMarkProps) {
  const [failed, setFailed] = useState(false);
  const isIconOnly = variant === "icon";
  const src = isIconOnly ? iconLogo : tone === "dark" ? logoDark : logoLight;
  const sizeClass =
    variant === "auth"
      ? "h-12 w-auto"
      : variant === "landing"
        ? "h-14 w-auto"
        : variant === "icon"
          ? "h-10 w-10"
          : "h-9 w-auto";

  if (failed) {
    return (
      <span className={`inline-flex items-center font-semibold tracking-tight ${className}`}>
        {isIconOnly ? "P" : "PotenCore"}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt="PotenCore"
      className={`${sizeClass} object-contain ${className}`.trim()}
      onError={() => setFailed(true)}
      loading="eager"
      decoding="async"
    />
  );
}
