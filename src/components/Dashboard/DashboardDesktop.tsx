"use client";

import { usePathname } from "next/navigation";
import { IDashboard } from "./types";

const styles = `
  .dd-page { animation: dd-page-in .2s cubic-bezier(.22,1,.36,1) both; }
  @keyframes dd-page-in {
    from { opacity: 0; transform: translateY(10px) scale(.995); }
    to   { opacity: 1; transform: none; }
  }
`;

const DashboardDesktop = ({ SidePanel, Workspace }: IDashboard) => {
  const pathname = usePathname();

  return (
    <div className="relative isolate flex h-full w-full flex-col overflow-hidden bg-bg">
      <style>{styles}</style>

      <div className="relative z-10 flex flex-1 overflow-hidden">
        <aside
          className="relative flex w-[244px] flex-shrink-0 flex-col overflow-hidden my-3 ml-3 rounded-xl"
          style={{
            transition: "all .3s ease",
            background:
              "linear-gradient(180deg, var(--panel) 0%, color-mix(in srgb, var(--panel) 100%, var(--primary)) 100%)",
          }}
        >
          <SidePanel />
        </aside>
        <main className="relative flex flex-1 flex-col overflow-hidden">
          <div
            key={pathname}
            className="dd-page relative z-[1] container flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-3 gap-3"
            children={Workspace}
          />
        </main>
      </div>
    </div>
  );
};

export default DashboardDesktop;
