import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPublic() {
    const cases = await this.prisma.case.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        chiefComplaint: true,
        difficulty: true,
        simulationCaseId: true,
        simulationTopicId: true,
        evaluationModuleId: true,
        patientProfile: true,
        openingStatement: true,
        createdAt: true,
      },
    });

    return { cases };
  }

  async findOnePublic(caseId: string) {
    const cpxCase = await this.prisma.case.findFirst({
      where: {
        OR: [{ id: caseId }, { slug: caseId }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        chiefComplaint: true,
        difficulty: true,
        simulationCaseId: true,
        simulationTopicId: true,
        evaluationModuleId: true,
        patientProfile: true,
        openingStatement: true,
        createdAt: true,
      },
    });

    if (!cpxCase) {
      throw new NotFoundException('Case not found');
    }

    return { case: cpxCase };
  }

  async findOneInternal(caseId: string) {
    const cpxCase = await this.prisma.case.findFirst({
      where: {
        OR: [{ id: caseId }, { slug: caseId }],
      },
    });

    if (!cpxCase) {
      throw new NotFoundException('Case not found');
    }

    return cpxCase;
  }
}
