"use client";

import * as React from "react";
import ITransitions from "./ITransitions";
import { cn } from "@/lib/utils";
import emptyFn from "@/lib/utils/emptyFn";

const Zoom = ({
  style,
  className,
  open,
  children,
  timeout = 250,
  // `emptyFn` è un riferimento stabile: un'arrow function inline come
  // default parameter verrebbe ricreata a ogni render, facendo ripartire
  // inutilmente gli effect qui sotto (che la usano in dependency array).
  onEnter = emptyFn,
  onEntered = emptyFn,
  onExit = emptyFn,
  onExited = emptyFn,
  unmountOnExit = true,
}: ITransitions) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (open && !mounted) {
      onEnter();

      setMounted(true);

      const timer = setTimeout(() => {
        onEntered();
      }, timeout);

      return () => clearTimeout(timer);
    }
  }, [mounted, onEnter, onEntered, open, timeout]);

  React.useEffect(() => {
    if (!open && mounted) {
      onExit();

      const timer = setTimeout(() => {
        setMounted(false);
        onExited();
      }, timeout);

      return () => clearTimeout(timer);
    }
  }, [mounted, onExit, onExited, open, timeout]);

  return (
    <div
      style={{
        transition: `${timeout}ms scale`,
        scale: open ? 1 : 0,
        ...style,
      }}
      className={cn(
        "inline-flex h-fit w-fit flex-col items-stretch justify-center",
        className
      )}
    >
      {!unmountOnExit || mounted ? children : undefined}
    </div>
  );
};

export default Zoom;
