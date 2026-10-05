import { z } from "zod";

export const MAX_VOUCHER_AMOUNT = 500;

// Creazione di un buono dal direttivo (POST `/api/vouchers`): importo in
// euro, positivo, al massimo al centesimo.
export const createVoucherSchema = z.object({
  userId: z.string().min(1),
  amount: z
    .number()
    .positive()
    .max(MAX_VOUCHER_AMOUNT)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: "Massimo due decimali",
    }),
});
