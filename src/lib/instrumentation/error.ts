import type { Instrumentation } from "next";
import { getPostHogServer } from "../posthog-server";

function readDistinctId(
  rawCookie: string | string[] | undefined
): string | undefined {
  if (!rawCookie) return undefined;
  const cookieString = Array.isArray(rawCookie)
    ? rawCookie.join("; ")
    : rawCookie;
  const match = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/);
  if (!match?.[1]) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as {
      distinct_id?: string;
    };
    return parsed.distinct_id;
  } catch (e) {
    console.error("Error parsing PostHog cookie:", e);
    return undefined;
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request
) => {
  const distinctId = readDistinctId(request.headers.cookie);
  await getPostHogServer().captureException(err, distinctId);
};
