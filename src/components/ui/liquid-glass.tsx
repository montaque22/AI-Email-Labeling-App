import type React from "react";
import { useState } from "react";
import { cn } from "../../lib/utils";

interface LiquidGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  expandable?: boolean;
  width?: string;
  height?: string;
  expandedWidth?: string;
  expandedHeight?: string;
  blurIntensity?: "sm" | "md" | "lg" | "xl";
  shadowIntensity?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  borderRadius?: string;
  glowIntensity?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
}

export function LiquidGlassCard({
  children,
  className = "",
  expandable = false,
  width,
  height,
  expandedWidth,
  expandedHeight,
  blurIntensity = "xl",
  borderRadius = "8px",
  glowIntensity = "none",
  shadowIntensity = "xs",
  onClick,
  style,
  ...props
}: LiquidGlassCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  function handleToggleExpansion(event: React.MouseEvent<HTMLDivElement>) {
    if (!expandable) {
      onClick?.(event);
      return;
    }
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    setIsExpanded((current) => !current);
    onClick?.(event);
  }

  const blurClasses = {
    sm: "backdrop-blur-xs",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
    xl: "backdrop-blur-xl",
  };

  const shadowStyles = {
    none: "inset 0 0 0 0 rgba(255, 255, 255, 0)",
    xs: "inset 1px 1px 1px 0 rgba(255, 255, 255, 0.3), inset -1px -1px 1px 0 rgba(255, 255, 255, 0.3)",
    sm: "inset 2px 2px 2px 0 rgba(255, 255, 255, 0.35), inset -2px -2px 2px 0 rgba(255, 255, 255, 0.35)",
    md: "inset 3px 3px 3px 0 rgba(255, 255, 255, 0.45), inset -3px -3px 3px 0 rgba(255, 255, 255, 0.45)",
    lg: "inset 4px 4px 4px 0 rgba(255, 255, 255, 0.5), inset -4px -4px 4px 0 rgba(255, 255, 255, 0.5)",
    xl: "inset 6px 6px 6px 0 rgba(255, 255, 255, 0.55), inset -6px -6px 6px 0 rgba(255, 255, 255, 0.55)",
  };

  const glowStyles = {
    none: "0 4px 4px rgba(0, 0, 0, 0.05), 0 0 12px rgba(0, 0, 0, 0.05)",
    xs: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 16px rgba(255, 255, 255, 0.05)",
    sm: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 24px rgba(255, 255, 255, 0.1)",
    md: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 32px rgba(255, 255, 255, 0.15)",
    lg: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 40px rgba(255, 255, 255, 0.2)",
    xl: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 48px rgba(255, 255, 255, 0.25)",
  };

  return (
    <div
      className={cn("relative text-zinc-950 bg-white/8", expandable && "cursor-pointer", className)}
      onClick={handleToggleExpansion}
      style={{
        borderRadius,
        ...(!expandable && width ? { width } : {}),
        ...(!expandable && height ? { height } : {}),
        ...(expandable ? { width: isExpanded ? expandedWidth || width : width, height: isExpanded ? expandedHeight || height : height } : {}),
        ...style,
      }}
      {...props}
    >
      <div className={cn("absolute inset-0 z-0", blurClasses[blurIntensity])} style={{ borderRadius }} />
      <div className="absolute inset-0 z-10" style={{ borderRadius, boxShadow: glowStyles[glowIntensity] }} />
      <div className="absolute inset-0 z-20" style={{ borderRadius, boxShadow: shadowStyles[shadowIntensity] }} />
      <div className="relative z-30 flex h-full min-h-0 flex-col">{children}</div>
    </div>
  );
}
