import { IDashboard } from "./types";
import DashboardDesktop from "./DashboardDesktop";
import DashboardMobile from "./DashboardMobile";
import { useIsMobile } from "@/hooks/use-mobile";

const Dashboard = ({ SidePanel, Workspace }: IDashboard) => {
  const isMobile = useIsMobile();

  if (isMobile === null) return null; // apertura diretta da mobile

  return isMobile ? (
    <DashboardMobile SidePanel={SidePanel} Workspace={Workspace} />
  ) : (
    <DashboardDesktop SidePanel={SidePanel} Workspace={Workspace} />
  );
};

export default Dashboard;
