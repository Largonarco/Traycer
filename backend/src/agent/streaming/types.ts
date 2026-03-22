// Multi-mode Stream Config
export type StreamConfig = {
  subgraphs: boolean;
  recursionLimit?: number;
  streamMode: ["updates", "messages"];
  configurable: { thread_id: string };
};

// Subagent Lifecycle Types
export interface TrackedSubagent {
  id: string;
  name: string;
  description: string;
  startedAt: number | undefined;
  completedAt: number | undefined;
  pregelTaskId: string | undefined;
  errorMessage: string | undefined;
  status: "pending" | "running" | "complete" | "error";
}
