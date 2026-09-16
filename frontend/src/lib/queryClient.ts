import { QueryClient } from "@tanstack/react-query";

/** Single shared instance so it can be cleared from outside React (see
 * authStore) whenever the logged-in user changes -- avoids ever serving one
 * account's cached data to another on the same device. */
export const queryClient = new QueryClient();
