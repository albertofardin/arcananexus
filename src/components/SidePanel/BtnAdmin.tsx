"use client";

import * as React from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import SideButton from "./SideButton";
import { adminNavItems } from "./profileNavItems";
import ModalCreateVoucher from "./ModalCreateVoucher";
import { routes } from "@/app/routes";
import { useCapabilities } from "@/lib/queries/capabilities";

// Menu di amministrazione piattaforma: visibile solo a direttivo/sviluppo
// e solo fuori dalle aree di campagna (nessun `campaignSlug` nella route).
const BtnAdmin = ({ onClose = () => null }: { onClose?: () => void }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { campaignSlug } = useParams<{ campaignSlug?: string }>();
  const { data: capabilities } = useCapabilities();
  const [voucherOpen, setVoucherOpen] = React.useState(false);
  const isPlatformAdmin =
    (capabilities?.isDirettivo ?? false) || (capabilities?.isSviluppo ?? false);

  if (!isPlatformAdmin || campaignSlug) return null;

  return (
    <>
      <SideButton
        icon="account_balance"
        label="Amministrazione"
        active={pathname.startsWith(`${routes.admin()}/`)}
        menu={{
          items: [
            // "Crea Buono": solo direttivo (l'API richiede anche la tessera).
            ...(capabilities?.isDirettivo
              ? [
                  {
                    id: "admin-voucher",
                    label: "Crea Buono",
                    icon: "gift_card",
                    onClick: () => setVoucherOpen(true),
                  },
                ]
              : []),
            ...adminNavItems.map(item => ({
              id: item.id,
              label: item.label,
              icon: item.icon,
              selected: pathname === item.route,
              onClick: () => {
                router.push(item.route as never);
                onClose();
              },
            })),
          ],
          originAnchor: { vertical: "top", horizontal: "left" },
          originTransf: { vertical: "bottom", horizontal: "left" },
        }}
      />
      <ModalCreateVoucher
        open={voucherOpen}
        onClose={() => setVoucherOpen(false)}
      />
    </>
  );
};

export default BtnAdmin;
