import posthog from "posthog-js";
import { POSTHOG_HOST, POSTHOG_KEY } from "./lib/constants";

posthog.init(POSTHOG_KEY, {
  api_host: POSTHOG_HOST,
  defaults: "2026-01-30",
});
