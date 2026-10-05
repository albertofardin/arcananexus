import { z } from "zod";

export const startImpersonationSchema = z.object({
  targetUserId: z.string().min(1, "Target user ID è richiesto"),
});

export const impersonationStatusSchema = z.object({
  isImpersonating: z.boolean(),
  activeUser: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  adminUser: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .nullable(),
});

export const userListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.coerce.date(),
});

// POST /api/admin/impersonate/start
export const startImpersonationResponseSchema = z.object({
  success: z.boolean(),
  targetUser: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
});

export type StartImpersonationInput = z.infer<typeof startImpersonationSchema>;
export type ImpersonationStatus = z.infer<typeof impersonationStatusSchema>;
export type UserListItem = z.infer<typeof userListItemSchema>;
export type StartImpersonationResponse = z.infer<
  typeof startImpersonationResponseSchema
>;
