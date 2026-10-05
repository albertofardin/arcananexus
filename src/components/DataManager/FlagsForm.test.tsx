import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTypeKind } from "@prisma/client";
import FlagsForm from "./FlagsForm";

// FlagsForm (T-0xx, "Aggiungi punto Missiva/Downtime"): le checkbox dei due
// flag legati a una Feature di campagna compaiono solo quando quella
// Feature è attiva — passato dal chiamante via `missiveActive`/
// `downtimeActive` (vedi `ManagerData.tsx`/`EntryFormAdvancedConfig`).
describe("FlagsForm — visibilità condizionata a una Feature (T-0xx)", () => {
  it("hides both point-bonus checkboxes when neither feature is active", () => {
    render(
      <FlagsForm kind={DataTypeKind.talent} value={{}} onChange={vi.fn()} />
    );

    expect(
      screen.queryByText("Aggiungi punto Missiva")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Aggiungi punto Downtime")
    ).not.toBeInTheDocument();
    // Gli altri flag del kind talent restano sempre visibili.
    expect(screen.getByText("Costo")).toBeInTheDocument();
    expect(screen.getByText("Ripetibile")).toBeInTheDocument();
  });

  it("shows only the missive checkbox when only FT_MISSIVE is active", () => {
    render(
      <FlagsForm
        kind={DataTypeKind.talent}
        value={{}}
        onChange={vi.fn()}
        missiveActive
        downtimeActive={false}
      />
    );

    expect(screen.getByText("+1pt Missiva")).toBeInTheDocument();
    expect(screen.queryByText("+1pt Downtime")).not.toBeInTheDocument();
  });

  it("shows both checkboxes when both features are active", () => {
    render(
      <FlagsForm
        kind={DataTypeKind.talent}
        value={{}}
        onChange={vi.fn()}
        missiveActive
        downtimeActive
      />
    );

    expect(screen.getByText("+1pt Missiva")).toBeInTheDocument();
    expect(screen.getByText("+1pt Downtime")).toBeInTheDocument();
  });
});
