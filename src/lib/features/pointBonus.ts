import { z } from "zod";

// Bonus/malus di punti (missive o downtime) assegnati dal master a un
// singolo personaggio, con motivazione mostrata nella scheda. Vive dentro
// `featureData` delle due feature (stesso principio di `notifyUserIds`):
// agisce sul massimale del personaggio, sommato a quello di campagna e al
// bonus da talenti (`Character.*PointsBonus`) al reset punti. `points` può
// essere negativo (malus). Solo `zod` qui: usato anche da Client Component.
export const pointBonusSchema = z.object({
  characterId: z.number().int().positive(),
  points: z
    .number()
    .int()
    .refine(n => n !== 0, "Il valore non può essere 0"),
  reason: z.string().trim().min(1),
});

export type PointBonus = z.infer<typeof pointBonusSchema>;

export const pointBonusesSchema = z.array(pointBonusSchema).default([]);

export const sumPointBonuses = (
  bonuses: PointBonus[],
  characterId: number | undefined
) =>
  bonuses
    .filter(b => b.characterId === characterId)
    .reduce((sum, b) => sum + b.points, 0);
