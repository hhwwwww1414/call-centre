import type {
  CallDirection,
  CallOutcome,
  CallResult,
  CallStatus,
  Role,
  TaskMetric,
  TaskStatus,
} from '@prisma/client';

/** Формы данных, которые API отдаёт клиенту. Даты приходят строками ISO. */

export type CallContact = {
  id: string;
  phoneE164: string;
  name: string | null;
  company: string | null;
  isBlocked: boolean;
};

export type CallUser = { id: string; name: string; extension: string | null };

export type CallItem = {
  id: string;
  externalId: string | null;
  provider: string;
  direction: CallDirection;
  status: CallStatus;
  outcome: CallOutcome;
  fromNumber: string;
  toNumber: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  waitSeconds: number | null;
  durationSeconds: number;
  recordingUrl: string | null;
  recordingReady: boolean;
  comment: string | null;
  tags: string[];
  result: CallResult | null;
  summary: string | null;
  isImportant: boolean;
  resultRequired: boolean;
  resultAt: string | null;
  contact: CallContact | null;
  user: CallUser | null;
};

export type PendingResultsResponse = { items: CallItem[]; total: number };

export type TaskItem = {
  id: string;
  batchId: string;
  title: string;
  description: string | null;
  metric: TaskMetric;
  target: number;
  status: TaskStatus;
  assigneeId: string;
  startsAt: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; name: string; extension: string | null };
  createdBy: { id: string; name: string } | null;
  progress: number;
  percent: number;
  isOverdue: boolean;
};

export type TaskSummary = {
  active: number;
  completed: number;
  overdue: number;
  progress: number;
  target: number;
};

export type TaskListResponse = { items: TaskItem[]; summary: TaskSummary };

export type TaskActivityResponse = {
  task: TaskItem;
  total: number;
  nextCursor: string | null;
  calls: {
    id: string;
    toNumber: string;
    startedAt: string;
    status: CallStatus;
    outcome: CallOutcome;
    result: CallResult | null;
    resultAt: string | null;
    summary: string | null;
    durationSeconds: number;
    waitSeconds: number | null;
    recordingReady: boolean;
    contact: { name: string | null } | null;
    credited: boolean;
    /** Почему не засчитан — по тем же правилам, что и прогресс. */
    reason: string | null;
  }[];
  audits: {
    id: string;
    action: string;
    entityId: string;
    meta: { from?: unknown; to?: unknown } | null;
    createdAt: string;
    actor: { name: string } | null;
  }[];
};

export type CallListResponse = {
  items: CallItem[];
  nextCursor: string | null;
  total: number;
};

export type CallHistoryItem = {
  id: string;
  direction: CallDirection;
  status: CallStatus;
  outcome: CallOutcome;
  result: CallResult | null;
  startedAt: string;
  durationSeconds: number;
  user: { id: string; name: string } | null;
};

export type CallDetailsResponse = {
  call: Omit<CallItem, 'contact'> & {
    contact:
      | (CallContact & {
          note: string | null;
          owner: { id: string; name: string } | null;
          marketplace: {
            id: string;
            profileType: string | null;
            verificationStatus: string | null;
            listingsActive: number;
            registeredAt: string;
            removedAt: string | null;
          } | null;
        })
      | null;
    createdAt: string;
    updatedAt: string;
    transcript: {
      status: string;
      language: string;
      fullText: string | null;
      segments: unknown;
      summary: string | null;
    } | null;
  };
  history: CallHistoryItem[];
  marketplaceProfile: string | null;
};

export type Kpi = {
  total: number;
  answered: number;
  missed: number;
  avgDurationSeconds: number;
  avgWaitSeconds: number;
  talkTimeSeconds: number;
  missedShare: number;
};

export type SeriesPoint = { bucket: string; inbound: number; outbound: number };

export type ManagerRow = {
  userId: string | null;
  name: string | null;
  extension: string | null;
  isActive: boolean;
  total: number;
  answered: number;
  missed: number;
  missedShare: number;
  avgDurationSeconds: number;
  avgWaitSeconds: number;
  talkTimeSeconds: number;
};

export type StatsResponse = {
  period: { preset: string; from: string; to: string; granularity: 'hour' | 'day' };
  kpi: Kpi;
  series: SeriesPoint[];
  outcomes: { outcome: CallOutcome; count: number }[];
  recent: CallItem[];
  callbackQueue: CallItem[];
  managers: ManagerRow[];
};

export type AnalyticsResponse = {
  period: { preset: string; from: string; to: string };
  managers: ManagerRow[];
  outcomes: { outcome: CallOutcome; count: number }[];
  hours: { hour: number; total: number; missed: number; missedShare: number }[];
  weekdays: { weekday: number; total: number }[];
};

export type ContactRow = {
  id: string;
  phoneE164: string;
  name: string | null;
  company: string | null;
  note: string | null;
  isBlocked: boolean;
  owner: { id: string; name: string } | null;
  callsCount: number;
  lastCall: { startedAt: string; direction: CallDirection; status: CallStatus } | null;
  marketplace: {
    id: string;
    profileType: string | null;
    verificationStatus: string | null;
    listingsActive: number;
    lastSeenAt: string | null;
    removedAt: string | null;
  } | null;
};

export type MarketplaceAccountView = {
  id: string;
  publicId: number;
  name: string | null;
  email: string | null;
  phoneVerified: boolean;
  registeredAt: string;
  accountStatus: string;
  sellerActivatedAt: string | null;
  lastSeenAt: string | null;
  profileType: string | null;
  profileName: string | null;
  legalName: string | null;
  city: string | null;
  region: string | null;
  verificationStatus: string | null;
  moderationNote: string | null;
  trustScore: number | null;
  profileCompleteness: number | null;
  listingsActive: number;
  listingsDraft: number;
  listingsPending: number;
  listingsRejected: number;
  listingsArchived: number;
  listingsSold: number;
  lastListingAt: string | null;
  views30d: number;
  leadsTotal: number;
  threadsTotal: number;
  dealsTotal: number;
  reviewsCount: number;
  reviewsAvg: number | null;
  links: { type: string; url: string }[];
  source: string | null;
  removedAt: string | null;
  syncedAt: string;
};

export type ContactListResponse = { items: ContactRow[]; nextCursor: string | null };

export type ContactDetailsResponse = {
  contact: {
    id: string;
    phoneE164: string;
    name: string | null;
    company: string | null;
    note: string | null;
    isBlocked: boolean;
    ownerId: string | null;
    owner: { id: string; name: string; extension: string | null } | null;
    createdAt: string;
    updatedAt: string;
    marketplace: MarketplaceAccountView | null;
  };
  marketplaceLinks: { profile: string; admin: string | null } | null;
  calls: CallItem[];
  total: number;
  nextCursor: string | null;
  summary: {
    calls: number;
    durationSeconds: number;
    lastCallAt: string | null;
    recordings: number;
    comments: number;
    taggedCalls: number;
    tags: string[];
  };
};

export type ContactHistoryView = 'all' | 'recordings' | 'comments' | 'tags';
export type ContactAuditResponse = {
  items: Array<Omit<AuditRow, 'ip' | 'actor'> & { actor: { id: string; name: string } | null }>;
  nextCursor: string | null;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  extension: string | null;
  personalNumber: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  timezone: string;
  lastLoginAt: string | null;
  createdAt: string;
  calls30d: number;
};

export type AccessResult =
  | { method: 'invite'; inviteUrl: string; expiresAt: string }
  | { method: 'password'; oneTimePassword: string };

export type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

export type AuditResponse = {
  items: AuditRow[];
  nextCursor: string | null;
  actions: string[];
  actors: { id: string; name: string }[];
};

export type TelephonyStatusResponse = {
  provider: 'mock' | 'exolve' | 'sipuni';
  configured: boolean;
  webhookUrl: string;
  routingUrl: string;
  credentials: Record<string, boolean>;
  lastCall: { startedAt: string; provider: string; status: CallStatus } | null;
  callsLast24h: number;
};
