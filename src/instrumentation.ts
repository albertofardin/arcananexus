import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { register: registerNode } = await import("./lib/instrumentation/node");
  await registerNode();
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { onRequestError: handler } =
    await import("./lib/instrumentation/error");
  return handler(...args);
};
