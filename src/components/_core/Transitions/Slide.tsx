"use client";

import * as React from "react";
import ITransitions from "./ITransitions";
import { cn } from "@/lib/utils";
import emptyFn from "@/lib/utils/emptyFn";

const Slide = ({
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
  direction = "right",
  unmountOnExit = true,
}: ITransitions) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (open && !mounted) {
      onEnter();

      setMounted(true);

      const timer = setTimeout(() => {
        onEntered();
      }, timeout + 250);

      return () => clearTimeout(timer);
    }
  }, [mounted, onEnter, onEntered, open, timeout]);

  React.useEffect(() => {
    if (!open && mounted) {
      onExit();

      const timer = setTimeout(() => {
        setMounted(false);
        onExited();
      }, timeout + 250);

      return () => clearTimeout(timer);
    }
  }, [mounted, onExit, onExited, open, timeout]);

  const getDirectionClass = () => {
    switch (direction) {
      case "top":
        return open ? "translate-y-0" : "translate-y-full";

      case "bottom":
        return open ? "translate-y-0" : "-translate-y-full";

      case "left":
        return open ? "translate-x-0" : "translate-x-full";

      case "right":
      default:
        return open ? "translate-x-0" : "-translate-x-full";
    }
  };

  return (
    <div
      style={{
        width: "inherit",
        height: "inherit",
        transitionDuration: `${timeout}ms`,
        ...style,
      }}
      className={cn(
        "absolute z-[1] inline-flex flex-col items-stretch justify-center transition-transform ease-linear",
        getDirectionClass(),
        className
      )}
    >
      {!unmountOnExit || mounted ? children : undefined}
    </div>
  );
};

export default Slide;
