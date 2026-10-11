import { Controller, Get, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly config?: ConfigService) {}
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'cpx-backend',
      timestamp: new Date().toISOString(),
      capabilities: {
        apiBudgetUsd: Number(this.config?.get<string>('API_BUDGET_USD')) || null,
        patientMode:
          this.config?.get<string>('PATIENT_AI_ENABLED') === 'true'
            ? 'model_enabled'
            : 'offline',
        speech: this.config?.get<string>('PATIENT_AI_ENABLED') === 'true' && !this.config?.get<string>('API_BUDGET_USD'),
        evaluation: this.config?.get<string>('PATIENT_AI_ENABLED') === 'true',
      },
    };
  }
}
