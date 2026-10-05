import z from "zod";

export const signupSchema = z.object({
  email: z.string().trim().min(1).email(),
  // Username per Better Auth: colonna `name`, resa univoca da
  // `@@unique([name])` e controllata dal databaseHook in `src/lib/auth.ts`.
  name: z.string().trim().min(1),
  // Stessa scelta minimale di `loginSchema`: il minimo reale (8 caratteri) è
  // enforced da Better Auth server-side.
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
