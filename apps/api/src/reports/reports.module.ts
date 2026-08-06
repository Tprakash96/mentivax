import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { GeminiService } from './gemini.service';
import { AskQueryService } from './ask-query.service';
import { AskService } from './ask.service';
import { AskSqlService } from './ask-sql.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, GeminiService, AskQueryService, AskService, AskSqlService],
  exports: [ReportsService],
})
export class ReportsModule {}
