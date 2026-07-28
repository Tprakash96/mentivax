import { Module } from '@nestjs/common';
import { FinancialYearsController } from './financial-years.controller';

@Module({ controllers: [FinancialYearsController] })
export class FinancialYearsModule {}
