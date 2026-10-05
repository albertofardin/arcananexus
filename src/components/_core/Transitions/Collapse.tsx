"use client";

import * as React from "react";
import ITransitions from "./ITransitions";
import { cn } from "@/lib/utils";
import emptyFn from "@/lib/utils/emptyFn";

const Collapse = ({
  style,
  className,
  open,
  children,
  timeout = 250,
  // `emptyFn` è un riferimento stabile: un'arrow function inline come
  // default parameter verrebbe ricreata a ogni render, facendo ripartire
  // l'effect qui sotto (che la usa in dependency array) in loop.
  onEnter = emptyFn,
  onEntered = emptyFn,
  onExit = emptyFn,
  onExited = emptyFn,
  unmountOnExit = true,
}: ITransitions) => {
  const refContainer = React.useRef<HTMLDivElement>(null);
  const refIsRender = React.useRef(false);
  const refIsOpened = React.useRef(false);

  const [dynamicChildren, setDynamicChildren] = React.useState(false);
  const [containerHeight, setContainerHeight] = React.useState<number | null>(
    null
  );

  React.useEffect(() => {
    const run = async () => {
      if (!refContainer.current) return;

      const call = refIsRender.current ? open !== refIsOpened.current : false;

      refIsOpened.current = open;
      refIsRender.current = true;

      if (open) {
        if (call) onEnter();

        setDynamicChildren(true);

        await new Promise(resolve => setTimeout(resolve, timeout));

        setContainerHeight(refContainer.current?.scrollHeight || 0);

        if (call) onEntered();

        await new Promise(resolve => setTimeout(resolve, timeout));

        setContainerHeight(null);
      } else {
        setContainerHeight(refContainer.current?.scrollHeight || 0);

        if (call) onExit();

        await new Promise(resolve => setTimeout(resolve, timeout));

        setContainerHeight(0);

        if (call) onExited();

        await new Promise(resolve => setTimeout(resolve, timeout));

        setDynamicChildren(false);
      }
    };

    run();
  }, [onEnter, onEntered, onExit, onExited, open, timeout]);

  return (
    <div
      ref={refContainer}
      style={{
        height: containerHeight === null ? "auto" : containerHeight,
        overflow: containerHeight === null ? "visible" : "hidden",
        transitionDuration: `${timeout}ms`,
        ...style,
      }}
      className={cn(
        "min-h-0 box-border transition-[height] ease-out",
        className
      )}
    >
      {!unmountOnExit || dynamicChildren ? children : undefined}
    </div>
  );
};

export default Collapse;
