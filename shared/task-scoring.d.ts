export const DEFER_THRESHOLD: 3;

export type TaskScoringInput = {
  priority?: 1 | 2 | 3 | number | null;
  due_date?: string | Date | null;
  dueDate?: string | Date | null;
  defer_count?: number | null;
  deferCount?: number | null;
  duplicate_count?: number | null;
  duplicateCount?: number | null;
  stuck?: boolean | null;
  created_at?: string | Date | null;
  createdAt?: string | Date | null;
};

export function dueDateUrgency(dueDate?: string | Date | null, now?: Date): number;
export function computeEffectiveScore(task: TaskScoringInput, now?: Date): number;
export function compareTasksByEffectiveScore(left: TaskScoringInput, right: TaskScoringInput): number;
