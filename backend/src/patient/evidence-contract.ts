import type { PatientPersona } from './patient-facts';
import type { PatientPhase } from './patient-question';

export const EVIDENCE_SCHEMA_VERSION = 'patient-evidence-v2.3.2';
export const PIPELINE_VERSION = 'patient-pipeline-v2.5';
export const ACTS = [
  'ask_history',
  'perform_exam',
  'explain_plan',
  'educate',
  'empathize',
  'social',
  'ask_diagnosis',
  'off_topic',
  'clarify',
  'confirm_dialogue',
] as const;
export const ASPECTS = [
  'value',
  'onset',
  'duration',
  'frequency',
  'severity',
  'direction',
  'first_age',
] as const;
export const TIME_SCOPES = [
  'unspecified',
  'episode',
  'current',
  'usual',
  'past',
] as const;
export type EvidenceFact = {
  id: string;
  caseId: string;
  caseVersion: string;
  conceptId: string;
  subjectId: string;
  eventId: string;
  timeScope: Exclude<(typeof TIME_SCOPES)[number], 'unspecified'>;
  phase: PatientPhase;
  aspect: (typeof ASPECTS)[number];
  label: string;
  value: string | number | boolean;
  unit: string | null;
  polarity: 'positive' | 'negative' | 'unspecified';
  informationSource: 'patient' | 'caregiver' | 'witness';
  visibility: 'patient';
  knownBy: string[];
  sourceRef: { path: string; contentHash: string; originalValue: unknown };
  reply: string;
  searchText: string;
};
export type EvidenceCorpus = {
  caseId: string;
  caseVersion: string;
  schemaVersion: string;
  facts: EvidenceFact[];
  issues: Array<{ path: string; reason: string }>;
};
export type TurnFrame = {
  frameId: string;
  originalSpan: { start: number; end: number };
  text: string;
  speechAct: (typeof ACTS)[number];
  conceptId: string | null;
  aspect: (typeof ASPECTS)[number];
  subjectId: string;
  eventId: string | null;
  timeScope: (typeof TIME_SCOPES)[number];
  phase: PatientPhase;
  examKey: string | null;
  searchText?: string;
};
export type DialogueExchange = {
  turn: number;
  question: string;
  reply: string;
  processingStatus: 'completed' | 'degraded';
};
export type DialogueMemory = {
  id: string; turn: number; question: string; reply: string;
  status: EvidenceAnswer['status']; factIds: string[];
};
export type PendingRepair = {
  id: string; turn: number; requestId?: string; question: string;
};
export type RepairResolution = { id: string; requestId?: string; frameIds: string[] };
export type DialogueState = {
  version: string;
  caseVersion: string;
  turn: number;
  lastFrames: TurnFrame[];
  answeredFactIds: string[];
  recentTurns?: DialogueExchange[];
  memory?: DialogueMemory[];
  pendingRepairs?: PendingRepair[];
};
export type EvidenceAnswer = {
  frame: TurnFrame;
  status: 'known' | 'not_provided' | 'needs_clarification' | 'acknowledge' | 'processing_failed';
  facts: EvidenceFact[];
  dialogueReference?: DialogueMemory;
};
export type ProcessingIssue = {
  stage: string;
  code: string;
  frameIds?: string[];
};
export type PatientTurnInput = {
  caseId: string;
  patientPrompt: string;
  persona: PatientPersona;
  chiefComplaint: string;
  content: string;
  state?: unknown;
  requestId?: string;
};
