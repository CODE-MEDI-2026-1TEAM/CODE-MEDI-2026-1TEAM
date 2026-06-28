import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type CpxCaseForCriteria = {
  slug?: string;
  title: string;
  chiefComplaint: string;
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
  };
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
        },
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
      if (entry.title_ko === '가슴 통증') {
        return /흉통|가슴\s*통증|가슴\s*아픔/.test(searchableCaseText);
      }
      if (entry.title_ko === '경련') {
        return /경련|발작|convulsion|seizure/i.test(searchableCaseText);
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
