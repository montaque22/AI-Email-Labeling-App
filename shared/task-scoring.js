export const DEFER_THRESHOLD = 3;

const PRIORITY_WEIGHT = {
  1: 0,
  2: 100,
  3: 200,
};

export function dueDateUrgency(dueDate, now = new Date()) {
  if (!dueDate) {
    return 120;
  }

  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return 120;
  }

  const hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilDue <= 0) {
    return -120;
  }
  if (hoursUntilDue <= 24) {
    return -80;
  }
  if (hoursUntilDue <= 72) {
    return -45;
  }
  if (hoursUntilDue <= 168) {
    return -15;
  }

  return Math.min(120, Math.floor(hoursUntilDue / 24));
}

export function computeEffectiveScore(task, now = new Date()) {
  const priority = Number(task?.priority);
  const priorityScore = PRIORITY_WEIGHT[priority] ?? PRIORITY_WEIGHT[2];
  const deferPenalty = Math.max(0, Number(task?.defer_count ?? task?.deferCount ?? 0)) * 18;
  const duplicateBoost = Math.max(0, Number(task?.duplicate_count ?? task?.duplicateCount ?? 0)) * -12;
  const stuckBoost = task?.stuck ? -35 : 0;

  return priorityScore + dueDateUrgency(task?.due_date ?? task?.dueDate, now) + deferPenalty + duplicateBoost + stuckBoost;
}

export function compareTasksByEffectiveScore(left, right) {
  const scoreDiff = computeEffectiveScore(left) - computeEffectiveScore(right);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const leftCreated = new Date(left?.created_at ?? left?.createdAt ?? 0).getTime();
  const rightCreated = new Date(right?.created_at ?? right?.createdAt ?? 0).getTime();
  return leftCreated - rightCreated;
}
