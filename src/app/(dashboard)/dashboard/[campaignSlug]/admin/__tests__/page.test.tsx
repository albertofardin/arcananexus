import { describe, it, expect } from "vitest";
import AdminHomePage from "../page";
import { routes } from "@/app/routes";

// T-028: `admin/` diventa l'indice reale dell'area di amministrazione
// campagna (non più il vecchio form mock `CampaignSettings`, mai collegato a
// schema). La guardia (head_master) è coperta a fondo in
// admin/__tests__/layout.test.tsx: qui si verifica solo il contenuto
// dell'indice, dato per già autorizzato.
describe("Campaign Admin home page — indice delle sotto-sezioni", () => {
  it("links to the real subsections (roles, characters, data types, features) for the resolved campaign slug", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "test-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain(routes.campaignAdminRoles("test-campaign"));
    expect(serialized).toContain(
      routes.campaignAdminCharacters("test-campaign")
    );
    expect(serialized).toContain(
      routes.campaignAdminDataTypes("test-campaign")
    );
    expect(serialized).toContain(routes.campaignAdminFeatures("test-campaign"));
  });

  it("no longer links the retired Downtime Actions mock (T-039, superseded by Feature/Action)", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "test-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Azioni Downtime");
  });

  it("does not render the old mock CampaignSettings form (T-013 candidato, mai collegato a schema)", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "test-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Le Cronache di Eldoria");
  });

  it("links the Tipi di Dato section (T-029/T-030, il Catalogo è confluito qui)", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "test-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Tipi di Dato");
    expect(serialized).toContain(
      routes.campaignAdminDataTypes("test-campaign")
    );
  });

  // T-046 round 4: "Talenti" è di nuovo raggiungibile dalla lista generica
  // "Tipi di Dato" (vedi `ManagerDataTypes`), quindi non ha più bisogno di
  // una voce di scorciatoia dedicata qui in "Gestione Campagna" — l'unica
  // voce che porta ai tipi di dato resta "Tipi di Dato" (test sopra).
  it("does not link a dedicated Talenti section (raggiungibile solo da Tipi di Dato)", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "test-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(
      routes.campaignAdminDataType("test-campaign", "Talenti")
    );
  });

  it("links the Feature section (T-031, no longer a placeholder)", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "test-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Feature");
    expect(serialized).toContain(routes.campaignAdminFeatures("test-campaign"));
  });

  it("links the Presentazione section (T-045, no longer a placeholder)", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "test-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Presentazione");
    expect(serialized).toContain(
      routes.campaignAdminPresentation("test-campaign")
    );
    expect(serialized).not.toContain("Prossimamente");
  });

  it("propagates the campaignSlug of the current route (multi-tenant: no hardcoded slug)", async () => {
    const result = await AdminHomePage({
      params: Promise.resolve({ campaignSlug: "other-campaign" }),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain(routes.campaignAdminRoles("other-campaign"));
  });
});
