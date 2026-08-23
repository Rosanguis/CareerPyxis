export const mentors = ["builder", "investor", "storyteller"] as const;
export type MentorId = (typeof mentors)[number];
export type Priority = "夯" | "稳" | "拉";
export type EvidenceLabel = "我的回答" | "导师观察" | "检索资料" | "已核验职业事实" | "AI 推断" | "缓存资料";
export type SourceMode = "live" | "cached" | "mixed";

export interface Profile {
  experience: string;
  responsibility: string;
  likedTasks: string[];
  dislikedTasks: string[];
  skills: string;
  weeklyTime: string;
  budget: string;
  location: string;
  workValues: string[];
}

export interface QuestionOption {
  id: string;
  label: string;
  signals: string[];
  insight: string;
}

export interface Question {
  id: string;
  mentor: MentorId;
  prompt: string;
  options: QuestionOption[];
  triggerSignals?: string[];
  triggerReason?: string;
}

export type QuestionFallbackCode = "timeout" | "busy" | "connection" | "invalid_response" | "configuration" | "unavailable";

export interface QuestionFallbackReason {
  code: QuestionFallbackCode;
  label: string;
}

export interface QuestionsResponse {
  questions: Question[];
  followUpCandidates: Question[];
  isFallback: boolean;
  fallbackReason?: QuestionFallbackReason;
  requestId: string;
}

export interface Answer {
  questionId: string;
  optionId: string;
  optionLabel: string;
  signals: string[];
  insight: string;
  supplement?: string;
}

export interface EvidenceItem {
  label: EvidenceLabel;
  content: string;
  sourceIds: string[];
}

export interface SevenDayAction {
  task: string;
  estimatedTime: string;
  budget: string;
  output: string;
  doneCriteria: string[];
  continueIf: string[];
  adjustIf: string[];
  exitIf: string[];
}

export interface RankedPath {
  priority: Priority;
  title: string;
  field: string;
  summary: string;
  evidenceItems: EvidenceItem[];
  matchReasons: string[];
  mentorSupport: string[];
  entryRequirements: string[];
  realWork: string[];
  tradeoffs: string[];
  evidenceGaps: string[];
  uncertainties: string[];
  sevenDayAction: SevenDayAction;
}

export interface MentorObservation {
  mentor: MentorId;
  observation: string;
  supportingAnswers: string[];
}

export interface CareerSource {
  id: string;
  label: "检索资料" | "已核验职业事实" | "缓存资料";
  title: string;
  publisher: string;
  url: string;
  region: string;
  publishedOrCheckedAt: string;
  retrievedAt: string;
  provider: string;
  sourceMode: "live" | "cached";
  supports: string;
  confidence: "高" | "中" | "待核实";
}

export interface CareerReport {
  mentorObservations: MentorObservation[];
  rankedPaths: RankedPath[];
  sources: CareerSource[];
  sourceMode: SourceMode;
  globalUncertainties: string[];
  generatedAt: string;
  requestId: string;
  dataNotice: string;
}

export interface ContributionDraft {
  field: string;
  experienceType: string;
  regionAndTime: string;
  projectType: string;
  actualTasks: string;
  skills: string;
  hiddenDifficulties: string;
  advice: string;
  limits: string;
  sensitiveContentNotice: string;
}

export type ExploreRequest =
  | { mode: "generate_questions"; requestId: string; profile: Profile }
  | { mode: "generate_report"; requestId: string; profile: Profile; answers: Answer[] }
  | { mode: "generate_contribution_draft"; requestId: string; profile: Profile; experienceType: string; authorized: boolean };

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean; stage?: string };
  requestId: string;
}
