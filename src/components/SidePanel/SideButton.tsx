"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import Btn from "@/components/_core/Btn";
import { cn } from "@/lib/utils";

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const SideButton = ({
  className,
  style,
  href,
  icon,
  label,
  active,
  onClick,
  onClose = () => null,
  menu,
}: {
  className?: string;
  style?: React.CSSProperties;
  href?: string;
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => Promise<void> | void;
  onClose?: () => void;
  menu?: React.ComponentProps<typeof Btn>["menu"];
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const isActive =
    active ?? (!!href && safeDecode(pathname) === safeDecode(href));

  // Stesso comportamento di <Link>: precarica la destinazione (fino al suo
  // loading.tsx) così il click mostra subito lo skeleton.
  React.useEffect(() => {
    if (href) router.prefetch(href);
  }, [href, router]);

  const handleClick = React.useCallback(async () => {
    if (onClick) await onClick();
    if (href) router.push(href as string);
    onClose();
  }, [href, onClick, onClose, router]);

  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-[8px] top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--panel-accent)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isActive
            ? "scale-100 opacity-100 shadow-[0_0_10px_var(--panel-accent)]"
            : "scale-0 opacity-0"
        )}
      />
      <Btn
        className={cn(
          "w-full max-w-none justify-start pl-5 pr-4 gap-3",
          className
        )}
        style={style}
        color="var(--panel-accent)"
        selected={isActive}
        icon={icon}
        label={label}
        onClick={menu ? undefined : handleClick}
        menu={menu}
      />
    </div>
  );
};

export default SideButton;
