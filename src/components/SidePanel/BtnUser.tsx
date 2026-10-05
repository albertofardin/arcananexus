"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { profileNavItems } from "./profileNavItems";
import { useSession, signOut } from "@/lib/auth-client";
import Text from "@/components/_core/Text";
import AvatarUser from "@/components/AvatarUser";
import BtnBase from "@/components/_core/BtnBase";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import PopoverList, { IPopoverListItem } from "@/components/_core/PopoverList";
import { cn } from "@/lib/utils";

const BtnUser = ({
  className,
  style,
  onClose,
}: {
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [modalLogout, setModalLogout] = React.useState(false);

  const openMenu = React.useCallback(() => setMenuOpen(true), []);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);
  const toggleModalLogout = React.useCallback(
    () => setModalLogout(v => !v),
    []
  );

  const onLogout = React.useCallback(async () => {
    await signOut();
    router.push("/" as never);
  }, [router]);

  const navigate = React.useCallback(
    (path: string) => {
      router.push(path as never);
      onClose?.();
    },
    [router, onClose]
  );

  const actions = React.useMemo<IPopoverListItem[]>(
    () => [
      ...profileNavItems.map(item => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        onClick: () => navigate(item.route),
        selected: item.matchPrefix
          ? pathname === item.route || pathname.startsWith(`${item.route}/`)
          : pathname === item.route,
      })),
      {
        id: "logout",
        label: "Esci",
        icon: "logout",
        divider: true,
        color: "var(--fail)",
        onClick: () => setModalLogout(true),
      },
    ],
    [pathname, navigate]
  );

  return (
    <div ref={anchorRef} className={cn("relative", className)} style={style}>
      <BtnBase
        className={cn(
          "flex w-full flex-row items-center gap-3 rounded border my-[1px] px-3 py-2 transition-colors duration-300",
          menuOpen
            ? "border-[var(--panel-accent)] bg-[color-mix(in_srgb,var(--panel-accent)_12%,var(--panel))]"
            : "border-transparent hover:border-[var(--panel-accent)]"
        )}
        onClick={openMenu}
      >
        <AvatarUser
          src={session?.user?.image}
          text={session?.user?.name}
          circle
          className="flex-shrink-0 border border-[var(--panel-accent)]"
        />
        <div className="flex min-w-0 flex-col items-start leading-tight">
          <Text
            ellipsis
            className="w-full text-left"
            style={{ color: "#fff" }}
            children={session?.user?.name ?? "Nome utente"}
          />
          <Text
            ellipsis
            size={0}
            className="w-full text-left"
            style={{
              color: "color-mix(in srgb, white 65%, transparent)",
            }}
            children={session?.user?.email ?? "Email"}
          />
        </div>
      </BtnBase>

      <PopoverList
        open={menuOpen}
        onClose={closeMenu}
        anchorEl={anchorRef.current}
        actions={actions}
        originAnchor={{ vertical: "top", horizontal: "left" }}
        originTransf={{ vertical: "bottom", horizontal: "left" }}
        style={{ minWidth: anchorRef.current?.offsetWidth }}
      />

      <Modal
        open={modalLogout}
        onClose={toggleModalLogout}
        title="Conferma logout"
        content={
          <Text children="Sei sicuro di voler uscire? Dovrai inserire nuovamente le tue credenziali per accedere." />
        }
        actions={
          <>
            <Btn label="ANNULLA" onClick={toggleModalLogout} />
            <Btn
              variant="bold"
              label="LOGOUT"
              color="var(--fail)"
              onClick={onLogout}
            />
          </>
        }
      />
    </div>
  );
};

export default BtnUser;
