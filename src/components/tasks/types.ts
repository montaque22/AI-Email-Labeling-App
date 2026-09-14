export type TaskPriority = 1 | 2 | 3;

export type TaskNudge = {
  steps: string[];
  currentStepIndex: number;
  generatedAt?: string;
  simplifiedAt?: string;
  completedAt?: string;
};

export type Task = {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  priority: TaskPriority;
  dueDate: string | null;
  project: string;
  deferCount: number;
  duplicateCount: number;
  sourceEmailId: string;
  stuck: boolean;
  nudge: TaskNudge;
  effectiveScore: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  similarity?: number;
};

export type TaskDraft = {
  title: string;
  notes: string;
  tags: string;
  priority: TaskPriority;
  dueDate: string;
  project: string;
  sourceEmailId: string;
};

export const emptyTaskDraft: TaskDraft = {
  title: "",
  notes: "",
  tags: "",
  priority: 2,
  dueDate: "",
  project: "",
  sourceEmailId: "",
};
