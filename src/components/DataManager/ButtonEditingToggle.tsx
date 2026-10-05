"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Btn from "@/components/_core/Btn";

export interface IButtonEditingToggle {
  editing: boolean;
}

export default function ButtonEditingToggle({ editing }: IButtonEditingToggle) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("editing", editing ? "0" : "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Btn
      className="border border-button"
      icon={editing ? "toggle_on" : "toggle_off"}
      iconStyle={editing ? { color: "var(--button)" } : {}}
      labelPosition
      label="Editor mode"
      onClick={toggle}
      selected={editing}
    />
  );
}
