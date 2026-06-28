import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type CpxCaseForCriteria = {
  slug?: string;
  simulationCaseId?: string | null;
  simulationTopicId?: string | null;
  title: string;
  chiefComplaint: string;
  hiddenDiagnosis?: string;
  evaluationModuleId?: string | null;
  checklist: unknown;
  redFlags: unknown;
};

type ModuleIndexEntry = {
  module_id: string;
  title_ko: string;
  domain_ko?: string;
  source_pdf_pages?: { start: number; end: number };
  json_file: string;
  markdown_file?: string;
};

type GlobalRubric = {
  source_pdf_pages?: number[];
  evaluation_strategy?: unknown;
  dimensions?: Array<{
    id: string;
    label: string;
    default_weight?: number;
    indicators?: string[];
    required_components?: Array<{ id: string; label: string }>;
    framework?: unknown;
    source_pdf_pages?: number[];
  }>;
  common_tips?: Array<{ id: string; label: string }>;
};

type EvaluationModule = {
  module_id: string;
  title_ko: string;
  domain_ko?: string;
  source_pdf_pages?: { start: number; end: number };
  source_markdown?: string;
  retrieval_tags?: string[];
  evaluation_use?: {
    required_common_rubric_ids?: string[];
    module_specific_evaluation_blocks?: Array<{
      id: string;
      label: string;
      source_hint?: string;
    }>;
  };
  extracted_hints?: {
    history_taking_text?: string;
    physical_exam_text?: string;
    patient_education_text?: string;
  };
};

export type EvaluationChecklistItem = {
  item: string;
  category: string;
};

export type EvaluationCriteriaPack = {
  selectedModule: {
    moduleId: string;
    title: string;
    domain?: string;
    sourcePdfPages?: { start: number; end: number };
  };
  caseChecklist: {
    checklist: unknown;
    redFlags: unknown;
    instructionItems: EvaluationChecklistItem[];
  };
  casePatientEducation: {
    likelyDiagnoses: string[];
    requiredTests: string[];
    requiredTreatmentEducation: string[];
    items: EvaluationChecklistItem[];
  };
  globalRubric: {
    sourcePdfPages?: number[];
    guardrails: string[];
    dimensions: Array<{
      id: string;
      label: string;
      indicators: string[];
      sourcePdfPages?: number[];
    }>;
    commonTips: string[];
  };
  moduleRubric: {
    blocks: Array<{ id: string; label: string; sourceHint?: string }>;
    historyTakingText?: string;
    physicalExamAndEducationText?: string;
    patientEducationText?: string;
  };
};

const CASE_MODULE_BY_SLUG: Record<string, string> = {
  'chest-pain-52m': 'cpx-08-chest_pain',
  'seizure-21m': 'cpx-34-seizure',
};

@Injectable()
export class EvaluationCriteriaService {
  private readonly logger = new Logger(EvaluationCriteriaService.name);
  private readonly baseDir = this.resolveBaseDir();

  buildCriteriaPack(
    cpxCase: CpxCaseForCriteria,
  ): EvaluationCriteriaPack | null {
    try {
      const moduleIndex = this.readJson<ModuleIndexEntry[]>(
        'data/cpx_module_index.json',
      );
      const globalRubric = this.readJson<GlobalRubric>(
        'data/global_evaluation_rubric.json',
      );
      const selectedModuleIndex = this.findModuleForCase(cpxCase, moduleIndex);

      if (!selectedModuleIndex) {
        this.logger.warn(
          `No evaluation module matched case "${cpxCase.slug ?? cpxCase.title}"`,
        );
        return null;
      }

      const selectedModule = this.readJson<EvaluationModule>(
        selectedModuleIndex.json_file,
      );

      const requiredRubricIds = new Set(
        selectedModule.evaluation_use?.required_common_rubric_ids ?? [],
      );
      const dimensions = (globalRubric.dimensions ?? [])
        .filter((dimension) => {
          if (requiredRubricIds.size === 0) return true;
          return requiredRubricIds.has(dimension.id);
        })
        .map((dimension) => ({
          id: dimension.id,
          label: dimension.label,
          indicators: this.dimensionIndicators(dimension),
          sourcePdfPages: dimension.source_pdf_pages,
        }));

      return {
        selectedModule: {
          moduleId: selectedModule.module_id,
          title: selectedModule.title_ko,
          domain: selectedModule.domain_ko,
          sourcePdfPages: selectedModule.source_pdf_pages,
        },
        caseChecklist: {
          checklist: cpxCase.checklist,
          redFlags: cpxCase.redFlags,
          instructionItems: this.buildInstructionItems(cpxCase),
        },
        casePatientEducation: this.buildPatientEducationCriteria(cpxCase),
        globalRubric: {
          sourcePdfPages: globalRubric.source_pdf_pages,
          guardrails: this.extractGuardrails(globalRubric),
          dimensions,
          commonTips: (globalRubric.common_tips ?? []).map((tip) => tip.label),
        },
        moduleRubric: {
          blocks:
            selectedModule.evaluation_use?.module_specific_evaluation_blocks ??
            [],
          historyTakingText: this.compactText(
            selectedModule.extracted_hints?.history_taking_text,
          ),
          physicalExamAndEducationText: this.compactText(
            selectedModule.extracted_hints?.physical_exam_text,
          ),
          patientEducationText: this.compactText(
            selectedModule.extracted_hints?.patient_education_text,
          ),
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to build evaluation criteria pack: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return null;
    }
  }

  private buildInstructionItems(
    cpxCase: CpxCaseForCriteria,
  ): EvaluationChecklistItem[] {
    return [
      ...this.asStringArray(cpxCase.checklist).map((item) => ({
        item,
        category: 'checklist',
      })),
      ...this.asStringArray(cpxCase.redFlags).map((item) => ({
        item,
        category: 'red_flag',
      })),
    ];
  }

  private buildPatientEducationCriteria(cpxCase: CpxCaseForCriteria) {
    const fromSimulation = this.findSimulationPatientEducation(cpxCase);
    const likelyDiagnoses =
      fromSimulation?.likelyDiagnoses ??
      this.splitListText(cpxCase.hiddenDiagnosis);
    const requiredTests = fromSimulation?.requiredTests ?? [];
    const requiredTreatmentEducation =
      fromSimulation?.requiredTreatmentEducation ?? [];

    return {
      likelyDiagnoses,
      requiredTests,
      requiredTreatmentEducation,
      items: [
        ...likelyDiagnoses.map((item) => ({
          item,
          category: 'likely_diagnosis',
        })),
        ...requiredTests.map((item) => ({
          item,
          category: 'required_test',
        })),
        ...requiredTreatmentEducation.map((item) => ({
          item,
          category: 'required_treatment_education',
        })),
      ],
    };
  }

  private findSimulationPatientEducation(
    cpxCase: CpxCaseForCriteria,
  ):
    | {
        likelyDiagnoses: string[];
        requiredTests: string[];
        requiredTreatmentEducation: string[];
      }
    | null {
    const caseNumber = this.simulationCaseNumber(cpxCase.simulationCaseId);
    if (!caseNumber) return null;

    const topicId = cpxCase.simulationTopicId ?? this.inferTopicId(cpxCase);
    if (topicId !== 'seizure') return null;

    const dataPath = this.resolveSimulationDataPath('seizure_cases.json');
    if (!dataPath) return null;

    const raw = JSON.parse(readFileSync(dataPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    const records = Object.values(raw).find(
      (value): value is Record<string, unknown>[] =>
        Array.isArray(value) &&
        value.some((item) => this.caseNumberFromRecord(item) !== null),
    );
    const record = records?.find(
      (item) => this.caseNumberFromRecord(item) === caseNumber,
    );
    const education = this.recordValue<Record<string, unknown>>(
      record,
      '\ud658\uc790\uad50\uc721',
    );

    if (!education) return null;

    return {
      likelyDiagnoses: this.recordStringArray(
        education,
        '\uac00\ub2a5\uc131\uc774\ub192\uc740\uc9c4\ub2e8',
      ),
      requiredTests: this.recordStringArray(
        education,
        '\ud544\uc694\ud55c\uac80\uc0ac\uacc4\ud68d',
      ),
      requiredTreatmentEducation: this.recordStringArray(
        education,
        '\ud544\uc694\ud55c\uce58\ub8cc\uad50\uc721\uacc4\ud68d',
      ),
    };
  }

  private simulationCaseNumber(
    simulationCaseId: string | null | undefined,
  ): number | null {
    if (!simulationCaseId) return null;
    const match = simulationCaseId.match(/(\d+)$/);
    if (!match) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private inferTopicId(cpxCase: CpxCaseForCriteria): string | null {
    if (cpxCase.simulationCaseId?.startsWith('seizure')) return 'seizure';
    return null;
  }

  private resolveSimulationDataPath(fileName: string): string | null {
    const candidates = [
      join(this.baseDir, '..', 'simulationRAG', 'data', fileName),
      join(process.cwd(), 'src/rag/simulationRAG/data', fileName),
      join(process.cwd(), 'dist/src/rag/simulationRAG/data', fileName),
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  private caseNumberFromRecord(record: unknown): number | null {
    if (!record || typeof record !== 'object') return null;
    const value = (record as Record<string, unknown>)['\uc99d\ub840\ubc88\ud638'];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private recordValue<T>(
    record: Record<string, unknown> | undefined,
    key: string,
  ): T | null {
    const value = record?.[key];
    if (!value || typeof value !== 'object') return null;
    return value as T;
  }

  private recordStringArray(
    record: Record<string, unknown>,
    key: string,
  ): string[] {
    return this.asStringArray(record[key]);
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private splitListText(value: string | undefined): string[] {
    if (!value) return [];
    return value
      .split(/[,/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private findModuleForCase(
    cpxCase: CpxCaseForCriteria,
    moduleIndex: ModuleIndexEntry[],
  ): ModuleIndexEntry | undefined {
    if (cpxCase.evaluationModuleId) {
      const explicit = moduleIndex.find(
        (entry) => entry.module_id === cpxCase.evaluationModuleId,
      );
      if (explicit) return explicit;
    }

    const mappedModuleId = cpxCase.slug
      ? CASE_MODULE_BY_SLUG[cpxCase.slug]
      : undefined;

    if (mappedModuleId) {
      return moduleIndex.find((entry) => entry.module_id === mappedModuleId);
    }

    const searchableCaseText = [cpxCase.title, cpxCase.chiefComplaint].join(
      ' ',
    );

    return moduleIndex.find((entry) => {
      if (searchableCaseText.includes(entry.title_ko)) return true;
      if (entry.module_id.includes('chest_pain')) {
        return /chest|pain/i.test(searchableCaseText);
      }
      if (entry.module_id.includes('seizure')) {
        return (
          cpxCase.simulationTopicId === 'seizure' ||
          cpxCase.simulationCaseId?.startsWith('seizure') === true ||
          /convulsion|seizure/i.test(searchableCaseText)
        );
      }
      return false;
    });
  }

  private dimensionIndicators(
    dimension: NonNullable<GlobalRubric['dimensions']>[number],
  ): string[] {
    const indicators = [...(dimension.indicators ?? [])];

    if (dimension.required_components) {
      indicators.push(
        ...dimension.required_components.map((component) => component.label),
      );
    }

    if (dimension.framework) {
      indicators.push(`framework: ${JSON.stringify(dimension.framework)}`);
    }

    return indicators;
  }

  private extractGuardrails(globalRubric: GlobalRubric): string[] {
    const strategy = globalRubric.evaluation_strategy as
      | { guardrails?: unknown }
      | undefined;

    return Array.isArray(strategy?.guardrails)
      ? strategy.guardrails.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
  }

  private compactText(text: string | undefined): string | undefined {
    if (!text) return undefined;
    return text.replace(/\s+/g, ' ').trim();
  }

  private readJson<T>(relativePath: string): T {
    const path = join(this.baseDir, relativePath);
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  }

  private resolveBaseDir(): string {
    const candidates = [
      join(process.cwd(), 'src/rag/evaluationRAG'),
      join(process.cwd(), 'dist/src/rag/evaluationRAG'),
      join(__dirname, 'evaluationRAG'),
    ];

    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new Error('evaluationRAG directory not found');
    }

    return found;
  }
}
