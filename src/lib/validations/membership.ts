import z from "zod";

// Base membership schema
export const membershipSchema = z.object({
  id: z.number(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  year: z.number(),
  userId: z.string(),
  paymentId: z.number(),
  payment: z
    .object({
      id: z.number(),
      value: z.string(), // Decimal converted to string for JSON serialization
      createdAt: z.coerce.date(),
      paymentData: z.record(z.string(), z.unknown()),
    })
    .nullable(),
});

// Extended schema with computed status
export const membershipWithStatusSchema = membershipSchema.extend({
  status: z.enum(["active", "expired"]),
});

// User profile info schema
export const userProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

// API response schema
export const membershipsResponseSchema = z.object({
  user: userProfileSchema,
  memberships: z.array(membershipWithStatusSchema),
});

// Avvio del pagamento (POST `/api/memberships/register`).
export const membershipRegisterSchema = z.object({
  // Solo tessera a pagamento: come verrà approvato l'ordine PayPal.
  method: z.enum(["paypal", "card"]).optional(),
});

// Cattura (POST `/api/memberships/paypal/capture`) dell'ordine già approvato.
export const membershipCaptureSchema = z.object({
  orderId: z.string().min(1),
});

// Type exports
export type Membership = z.infer<typeof membershipSchema>;
export type MembershipWithStatus = z.infer<typeof membershipWithStatusSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type MembershipsResponse = z.infer<typeof membershipsResponseSchema>;
