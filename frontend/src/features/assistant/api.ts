import { api } from "@/lib/api";

export type LLMProvider = "gemini" | "claude" | "chatgpt";

export interface LLMCredential {
  configured: boolean;
  provider: LLMProvider | null;
  model: string | null;
  updated_at: string | null;
}

export async function getCredential(): Promise<LLMCredential> {
  const { data } = await api.get<LLMCredential>("/assistant/credential");
  return data;
}

export async function saveCredential(input: {
  provider: LLMProvider;
  api_key: string;
  model?: string;
}): Promise<LLMCredential> {
  const { data } = await api.put<LLMCredential>("/assistant/credential", input);
  return data;
}

export async function deleteCredential(): Promise<void> {
  await api.delete("/assistant/credential");
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ToolEvent {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export interface ChatResponse {
  message: ChatMessage;
  tool_events: ToolEvent[];
}

export async function sendChatMessage(input: {
  messages: ChatMessage[];
  categoryId?: string | null;
}): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>("/assistant/chat", {
    messages: input.messages,
    category_id: input.categoryId ?? undefined,
  });
  return data;
}
