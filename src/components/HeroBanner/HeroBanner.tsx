import * as React from "react";
import { cn } from "@/lib/utils";

export interface IHeroBanner {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onClick?: () => void;
}

const HeroBanner = ({ children, className, style, onClick }: IHeroBanner) => (
  <div
    className={cn(
      "relative rounded-xl min-h-fit p-4",
      "flex flex-col items-stretch",
      onClick && "cursor-pointer",
      className
    )}
    style={{
      transition: "all .3s ease",
      background:
        "linear-gradient(135deg, var(--panel) 0%, color-mix(in srgb, var(--panel) 60%, var(--primary)) 100%)",
      ...style,
    }}
    onClick={onClick}
  >
    <div className="h-full w-full top-0 left-0 absolute rounded-xl overflow-hidden">
      <div
        className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-10"
        style={{ background: "var(--primary)" }}
      />
      <div
        className="absolute -bottom-8 right-24 h-32 w-32 rounded-full opacity-10"
        style={{ background: "var(--primary)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "var(--panel-texture)",
          backgroundSize: "340px",
          backgroundRepeat: "repeat",
          mixBlendMode: "screen",
          opacity: "0.55",
        }}
      />
    </div>
    <div className={cn("relative w-full h-full")} children={children} />
  </div>
);

export default HeroBanner;
