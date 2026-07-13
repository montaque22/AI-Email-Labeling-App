export type PromptToolChoice = "auto" | "required";

export type PromptSelectedTool = {
  toolClientId: string;
  toolName: string;
};

export type CustomAiPrompt = {
  id: string;
  name: string;
  description: string;
  markdown: string;
  toolChoice: PromptToolChoice;
  selectedTools: PromptSelectedTool[];
  createdAt: string;
  updatedAt: string;
};

export type PromptTool = {
  clientId: string;
  clientName: string;
  name: string;
  description: string;
};

export type ByoAiToolConfig = {
  aiEnabled?: boolean;
  mcpClientEnabled?: boolean;
  platforms?: Array<{ provider: string; status: string }>;
  mcpClients?: Array<{
    id?: string;
    name?: string;
    serverUrl?: string;
    isSystem?: boolean;
    enabled: boolean;
    status: string;
    tools: Array<{ name: string; description: string }>;
    selectedTools: string[];
  }>;
};
