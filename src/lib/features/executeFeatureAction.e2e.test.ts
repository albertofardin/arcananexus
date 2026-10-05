import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ActionDataValidationError,
  UnknownFeatureFunctionError,
  executeFeatureAction,
  // Importare dal barrel `./registry` non registra gli handler reali: li
  // importiamo esplicitamente qui sotto (side-effect), come fa `./index`.
} from "./registry";
// `progress` (T-0xx, fusione talenti + recupero XP alla morte, Opzione
// B): un solo `functionName` eseguibile per entrambi, importa già a sua
// volta `./handlers/talents`/`./handlers/deathXpRecovery` (side-effect,
// nessuna registrazione propria di quei due moduli — vedi i loro commenti).
import "./handlers/progress";
import { CharacterNotDeceasedError } from "./handlers/deathXpRecovery";
import { FT_PROGRESS } from "./featuresName";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCampaign,
  mockCharacter,
  mockFeature,
} from "@/test/helpers/prisma-fixtures";

// QA (T-019): a differenza di `registry.test.ts` (registry azzerato,
// handler di test fittizi), questo file esercita `executeFeatureAction` con
// il registry *reale* (l'handler `progress` vero, auto-registrato
// import-time) per confermare end-to-end 3 scenari specifici richiesti in
// verifica QA:
// 1) actionData malformato viene rifiutato PRIMA di toccare il DB;
// 2) deathXpRecovery su un PG vivo viene rifiutato con errore gestito;
// 3) un functionName che collide con Object.prototype si comporta come uno
//    sconosciuto qualunque (nessun leak strutturale, Map non object literal).
describe("executeFeatureAction end-to-end (real registry, T-019 QA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed talents actionData (missing referenceDataId) before touching the DB", async () => {
    const character = mockCharacter({ id: 1, campaignId: 1 });
    const feature = mockFeature({
      id: 5,
      campaignId: 1,
      featureData: { talentsEnabled: true },
    });
    const campaign = mockCampaign({ id: 1 });

    await expect(
      executeFeatureAction(prismaClient, {
        functionName: FT_PROGRESS,
        character,
        feature,
        // manca `referenceDataId`, richiesto dallo schema reale per
        // `kind: "talent"`.
        actionData: { kind: "talent" },
        campaign,
      })
    ).rejects.toBeInstanceOf(ActionDataValidationError);

    expect(prismaMock.referenceData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.action.create).not.toHaveBeenCalled();
    expect(prismaMock.characterData.create).not.toHaveBeenCalled();
    expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
  });

  it("rejects deathXpRecovery on a living character (deathDate: null) with a handled error, no crash", async () => {
    prismaMock.character.findUnique.mockResolvedValue(
      mockCharacter({ id: 10, campaignId: 1, deathDate: null })
    );
    const successor = mockCharacter({ id: 11, campaignId: 1 });
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: {
        deathXpRecoveryEnabled: true,
        deathXpRecoveryPercentage: 50,
      },
    });
    const campaign = mockCampaign({ id: 1 });

    await expect(
      executeFeatureAction(prismaClient, {
        functionName: FT_PROGRESS,
        character: successor,
        feature,
        actionData: { kind: "deathXpRecovery", deceasedCharacterId: 10 },
        campaign,
      })
    ).rejects.toBeInstanceOf(CharacterNotDeceasedError);

    expect(prismaMock.action.create).not.toHaveBeenCalled();
    expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
  });

  it.each(["toString", "constructor", "hasOwnProperty", "__proto__"])(
    "treats %s as an unregistered functionName through the real executeFeatureAction entry point",
    async functionName => {
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const feature = mockFeature({ id: 5, campaignId: 1 });
      const campaign = mockCampaign({ id: 1 });

      await expect(
        executeFeatureAction(prismaClient, {
          functionName,
          character,
          feature,
          actionData: {},
          campaign,
        })
      ).rejects.toBeInstanceOf(UnknownFeatureFunctionError);

      expect(prismaMock.action.create).not.toHaveBeenCalled();
    }
  );
});
