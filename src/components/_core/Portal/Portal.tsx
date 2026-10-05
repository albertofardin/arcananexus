import * as React from "react";
import { createPortal } from "react-dom";

const getNodePortal = (): HTMLElement | undefined => {
  if (typeof document === "undefined") return undefined;
  return (
    document.getElementById("app") ||
    document.getElementById("root") ||
    document.getElementById("storybook-root") ||
    document.body ||
    undefined
  );
};

export interface IPortal {
  node?: HTMLElement;
  children: React.ReactNode;
}
const MyPortal = ({ node, children }: IPortal) => {
  // In SSR `document` non esiste, mentre al primo render client sì: senza
  // questo gate il markup del client in fase di hydration non combacerebbe
  // con quello del server, facendo fallire l'hydration su ogni pagina che
  // monta un Portal.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const target = node ?? getNodePortal();
  return target ? createPortal(children, target) : null;
};

export default MyPortal;
