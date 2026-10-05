import z from "zod";

export const organizationSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const EMPTY_INSTANCE: Organization = {
  id: 0,
  name: "",
  slug: "",
};
