import { Module } from '@nestjs/common';
import { FeeStructureModule } from '../fee-structure/fee-structure.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceGenerationService } from './invoice-generation.service';

@Module({
  imports: [FeeStructureModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceGenerationService],
  exports: [InvoicesService, InvoiceGenerationService],
})
export class InvoicesModule {}
