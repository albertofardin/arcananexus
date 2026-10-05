import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { DataVisibility } from "@prisma/client";
import ReportTalentsPanel from "./ReportTalentsPanel";
import type { CountEntry } from "./aggregate";
import type { ReportCharacterRow } from "./types";
import type { TalentAccordionEntry } from "@/components/TalentList";

const catalog: TalentAccordionEntry[] = [
  ["Guida", "Generale"],
  ["Furtività", "Generale"],
  ["Mira", "Combattimento"],
].map(([name, category], i) => ({
  id: i + 1,
  name,
  description: null,
  visibility: DataVisibility.visible,
  flags: { category },
}));

const talents: CountEntry[] = [
  { id: "Guida", label: "Guida", count: 1 },
  { id: "Furtività", label: "Furtività", count: 0 },
  { id: "Mira", label: "Mira", count: 0 },
];

const characters = [
  {
    id: 1,
    name: "Aldo",
    userName: "Giulia",
    type: "pg",
    avatar: null,
    lastUpdateDate: "2026-01-01T00:00:00.000Z",
    approvalDate: null,
    parkDate: null,
    deathDate: null,
    talents: ["Guida"],
  },
] as ReportCharacterRow[];

// `selected` è sollevato in `CampaignReport`: nei test lo si simula con un
// piccolo wrapper stateful.
function renderPanel(props: { talents: CountEntry[]; total: number }) {
  function Wrapper() {
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    return (
      <ReportTalentsPanel
        catalog={catalog}
        characters={characters}
        selected={selected}
        onSelectedChange={setSelected}
        {...props}
      />
    );
  }
  return render(<Wrapper />);
}

describe("ReportTalentsPanel", () => {
  it("shows the empty state when there are no talents in scope", () => {
    renderPanel({ talents: [], total: 0 });

    expect(screen.getByText("Nessun talento assegnato")).toBeInTheDocument();
  });

  it("adds a talent to the comparison table and lists its characters in a modal", async () => {
    renderPanel({ talents, total: 4 });

    fireEvent.click(screen.getByText("Generale"), { detail: 1 });
    fireEvent.click(screen.getAllByText("Aggiungi")[1], { detail: 1 });

    // Righe ordinate per nome: [0] Furtività, [1] Guida (1 su 4 -> 25%).
    expect(screen.getByText("25%")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Talenti selezionati"), { detail: 1 });
    expect(await screen.findByText("Aldo")).toBeInTheDocument();
  });

  it("select all applies to the open category, or to the search results when filtering", async () => {
    renderPanel({ talents, total: 4 });
    const table = () => screen.queryAllByText(/^(Guida|Furtività|Mira)$/);

    fireEvent.click(screen.getByText("Generale"), { detail: 1 });
    fireEvent.click(screen.getByText("Seleziona tutti"), { detail: 1 });
    // 2 righe lista + 2 righe tabella: Mira (altra categoria) non selezionata.
    expect(table()).toHaveLength(4);
    fireEvent.click(screen.getByText("Deseleziona tutti"), { detail: 1 });

    fireEvent.change(screen.getByPlaceholderText("Cerca..."), {
      target: { value: "mir" },
    });
    // FieldText ha un debounce: la lista si restringe solo dopo.
    await waitFor(() => expect(screen.queryByText("Guida")).toBeNull());
    fireEvent.click(screen.getByText("Seleziona tutti"), { detail: 1 });
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getAllByText("Mira")).toHaveLength(2);
  });
});
