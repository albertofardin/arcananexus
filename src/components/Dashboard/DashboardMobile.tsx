"use client";
import * as React from "react";
import { IDashboard } from "./types";
import NavBar from "./NavBar";
import { Slide } from "@/components/_core/Transitions";
import Backdrop from "@/components/_core/Backdrop";

const DashboardMobile = ({ SidePanel, Workspace }: IDashboard) => {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const openDrawer = React.useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      {/* Slide-in drawer (from left) */}
      <Slide
        open={drawerOpen}
        direction="right"
        style={{ width: "fit-content", zIndex: 2 }}
      >
        <aside className="relative flex w-fit h-dvh flex-col overflow-hidden bg-[var(--panel)]">
          <SidePanel onClose={closeDrawer} />
        </aside>
      </Slide>
      <Backdrop open={drawerOpen} onClick={closeDrawer} />
      <div className="relative isolate flex h-full w-full flex-col overflow-hidden">
        <main className="relative flex flex-1 flex-col overflow-hidden bg-bg">
          <div
            className="relative container flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-3 gap-3"
            children={Workspace}
          />
        </main>

        <NavBar onOpenMenu={openDrawer} />
      </div>
    </>
  );
};

export default DashboardMobile;
