export type SpeechRecognitionConstructor = new () => SpeechRecognition;

export type SpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

export type SpeechRecognitionErrorEvent = {
  error: string;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type CpxCase = {
  id: string;
  slug: string;
  title: string;
  chiefComplaint: string;
  difficulty: string;
  simulationCaseId?: string | null;
  simulationTopicId?: string | null;
  evaluationModuleId?: string | null;
  patientProfile: {
    age?: number;
    ageRaw?: string;
    birthDate?: string | null;
    name?: string;
    sex?: string;
    occupation?: string;
    respondent?: string;
    tone?: string;
    vitalSigns?: {
      맥박?: string;
      체온?: string;
      혈압?: string;
      호흡?: string;
    };
  };
  openingStatement: string;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type SystemTimelineEvent = {
  id: string;
  content: string;
  createdAt: string;
};

export type Session = {
  id: string;
  status: 'active' | 'completed';
  startedAt: string;
  endedAt?: string | null;
  case: CpxCase;
  messages: Message[];
  evaluation?: Evaluation | null;
};

export type Evaluation = {
  id: string;
  score: number;
  strengths: string[];
  missedItems: string[];
  riskAssessment: string;
  suggestions: string[];
  caseInstructionStatus: EvaluationItemStatus[];
  patientEducationStatus: EvaluationItemStatus[];
  createdAt: string;
};

export type EvaluationItemStatus = {
  item: string;
  category?: string;
  status: 'met' | 'partial' | 'unmet';
  evidence: string[];
  feedback: string;
};
