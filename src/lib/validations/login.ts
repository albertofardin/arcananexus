import z from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
