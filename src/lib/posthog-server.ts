import { PostHog } from "posthog-node";
import { POSTHOG_HOST, POSTHOG_KEY } from "./constants";

let posthogInstance: PostHog | null = null;

export function getPostHogServer(): PostHog {
  if (!posthogInstance) {
    posthogInstance = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogInstance;
}
