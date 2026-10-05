import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequirementType } from "@prisma/client";
import RequirementTargetSelect from "@/components/DataManager/RequirementTargetSelect";

const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

const dataTypeBase = {
  campaignId: 1,
  description: null,
  cardinality: "multi",
  assignability: "none",
  mandatory: false,
  sidebarShow: true,
  sidebarOrder: null,
  icon: null,
  renderAs: "catalog",
  visibility: "visible",
};

const dataTypes = [
  { ...dataTypeBase, id: 1, name: "Talenti", kind: "talent" },
  { ...dataTypeBase, id: 2, name: "Oggetti Magici", kind: "assignable" },
  // `origins`/`generic`: non sono categorie di bersaglio valide per un
  // requisito, non devono comparire nel select "Categoria".
  { ...dataTypeBase, id: 3, name: "Razza", kind: "origins" },
  { ...dataTypeBase, id: 4, name: "Fazione", kind: "generic" },
];

const entriesByDataType: Record<number, { id: number; name: string }[]> = {
  1: [
    { id: 10, name: "Postino" },
    { id: 11, name: "Combattente" },
  ],
  2: [{ id: 20, name: "Spada" }],
  3: [{ id: 30, name: "Elfo" }],
};

const mockFetch = () => {
  global.fetch = vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes("/data-types")) {
      return Promise.resolve({
        ok: true,
        json: async () => dataTypes,
      } as Response);
    }
    if (href.includes("/reference-data")) {
      const dataTypeId = Number(
        new URL(href, "http://x").searchParams.get("dataTypeId")
      );
      const entries = (entriesByDataType[dataTypeId] ?? []).map(entry => ({
        id: entry.id,
        dataTypeId,
        name: entry.name,
        description: null,
        flags: null,
        visibility: "visible",
        fileUrl: null,
        fileKey: null,
        externalId: null,
      }));
      return Promise.resolve({
        ok: true,
        json: async () => entries,
      } as Response);
    }
    return Promise.reject(new Error(`Unhandled fetch: ${href}`));
  }) as unknown as typeof fetch;
};

const renderSelect = (
  onChange: (value: string, label: string) => void,
  type: RequirementType = RequirementType.requires,
  initialCategoryLabel?: string
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RequirementTargetSelect
        campaignSlug="test-campaign"
        type={type}
        value=""
        onChange={onChange}
        initialCategoryLabel={initialCategoryLabel}
      />
    </QueryClientProvider>
  );
};

describe("RequirementTargetSelect", () => {
  it("propone come Categoria solo i DataType di kind talent/assignable, escludendo origins/generic (requires/blocks)", async () => {
    mockFetch();
    renderSelect(vi.fn());

    click1(await screen.findByText("Seleziona..."));
    expect(
      await screen.findByRole("button", { name: /talenti/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /oggetti magici/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^razza$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /fazione/i })
    ).not.toBeInTheDocument();
  });

  it("propone anche origins (es. Razza) come Categoria per visibleWith/grants (T-050)", async () => {
    mockFetch();
    renderSelect(vi.fn(), RequirementType.visibleWith);

    click1(await screen.findByText("Seleziona..."));
    expect(
      await screen.findByRole("button", { name: /^razza$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /fazione/i })
    ).not.toBeInTheDocument();
  });

  it("abilita il select Voce solo dopo aver scelto una Categoria, filtrando le Voci di quella categoria", async () => {
    mockFetch();
    const onChange = vi.fn();
    renderSelect(onChange);

    // Il select "Voce" mostra un placeholder che invita a scegliere prima
    // la Categoria, ed è disabilitato (click non apre il popover).
    expect(
      await screen.findByText("Scegli prima una categoria")
    ).toBeInTheDocument();

    click1(await screen.findByText("Seleziona..."));
    click1(await screen.findByRole("button", { name: /talenti/i }));

    // Cambiare categoria resetta la Voce eventualmente già scelta.
    expect(onChange).toHaveBeenCalledWith("", "", "");

    click1(await screen.findByText("Seleziona una voce..."));
    expect(
      await screen.findByRole("button", { name: /postino/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /spada/i })
    ).not.toBeInTheDocument();

    click1(screen.getByRole("button", { name: /postino/i }));
    expect(onChange).toHaveBeenCalledWith("10", "Postino", "Talenti");
  });

  it("precompila la Categoria da initialCategoryLabel (edit di una riga esistente, T-0xx)", async () => {
    mockFetch();
    renderSelect(vi.fn(), RequirementType.requires, "Talenti");

    // Nessun click sul select "Categoria": la Voce di "Talenti" è già
    // interrogabile, la Categoria risulta risolta per nome.
    click1(await screen.findByText("Seleziona una voce..."));
    expect(
      await screen.findByRole("button", { name: /postino/i })
    ).toBeInTheDocument();
  });
});
