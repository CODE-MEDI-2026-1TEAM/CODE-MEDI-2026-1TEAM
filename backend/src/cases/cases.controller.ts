import { Controller, Get, Param } from '@nestjs/common';
import { CasesService } from './cases.service';

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get()
  findAll() {
    return this.casesService.findAllPublic();
  }

  @Get(':caseId')
  findOne(@Param('caseId') caseId: string) {
    return this.casesService.findOnePublic(caseId);
  }
}
