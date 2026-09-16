import { isAxiosError } from "axios";

/** Extracts a backend-provided error message (FastAPI's `{"detail": "..."}`
 * shape) from an axios error, falling back to a generic message. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return fallback;
}
