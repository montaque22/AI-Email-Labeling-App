import * as React from "react";
import { cn } from "../../lib/utils";
import { LiquidGlassCard } from "./liquid-glass";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <LiquidGlassCard
      borderRadius="8px"
      className={cn("text-zinc-950 bg-white/50", className)}
      glowIntensity="none"
      shadowIntensity="xs"
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold leading-none tracking-normal", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-zinc-500", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
