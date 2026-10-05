import type { ISidePanelProps } from "@/components/SidePanel";

export interface IDashboard {
  SidePanel: React.ComponentType<ISidePanelProps>;
  Workspace?: React.ReactNode;
}
