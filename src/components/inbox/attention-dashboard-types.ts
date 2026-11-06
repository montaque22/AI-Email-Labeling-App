import type { ReactNode } from "react";

export type AttentionCategory = "attention" | "interest" | "cleanup";

export type AttentionMessage = {
  id: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  provider: string;
  mailbox?: string;
  from: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
  labels: string[];
  hasAttachments: boolean;
  archived?: boolean;
  followed?: boolean;
  interestFreshness?: {
    days: number;
    label: string;
    state: "fresh" | "cooling" | "review" | "stale";
  } | null;
  commitment?: {
    text: string;
    dueAt: string;
    setAt: string;
    completedAt?: string;
    isCompleted?: boolean;
  } | null;
  attention: {
    category: string;
    explanation: string;
    quickWin?: {
      actionType?: string;
      isQuickWin: boolean;
      quickWinConfidence?: number;
      requiredCapabilities?: string[];
      requiresExternalWork?: boolean;
      suggestedNextAction?: string;
    };
    reasonCode: string;
  };
};

export type AttentionCleanupGroup = {
  id: string;
  name: string;
  count: number;
  mostRecentAt: string;
  messages: AttentionMessage[];
};

export type AttentionPagination = {
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
};

export type AttentionDashboardData = {
  counts: Record<AttentionCategory, number>;
  categories: Record<AttentionCategory, AttentionMessage[]>;
  cleanupCounts?: { likelyClutter: number; needsReview: number };
  cleanupReview?: AttentionMessage[];
  commitments?: AttentionMessage[];
  cleanupGroups: AttentionCleanupGroup[];
  pagination: Record<"attention" | "interest", AttentionPagination>;
  quickWinCount?: number;
  quickWins?: AttentionMessage[];
};

export type AttentionDashboardProps = {
  category: AttentionCategory;
  data: AttentionDashboardData | null;
  detailPanel?: ReactNode;
  isActionRunning?: boolean;
  isLoading: boolean;
  onArchive: (messages: AttentionMessage[]) => Promise<void> | void;
  onCommitment: (message: AttentionMessage) => void;
  onDelete: (messages: AttentionMessage[]) => Promise<void> | void;
  onLoadMore: (category: "attention" | "interest") => Promise<void>;
  onOpen: (message: AttentionMessage) => void;
  onNotQuickWin: (message: AttentionMessage) => Promise<void> | void;
  onReturnInterest: (message: AttentionMessage) => Promise<void> | void;
  onSelectAllMatching: (category: "attention" | "interest") => Promise<AttentionMessage[]>;
  onSelectCategory: (category: AttentionCategory) => void;
  onSelectionChange: (messages: AttentionMessage[]) => void;
  onToggleFollow: (message: AttentionMessage) => Promise<void> | void;
  onStillInterested: (message: AttentionMessage) => Promise<void> | void;
  selectedMessages: AttentionMessage[];
};
