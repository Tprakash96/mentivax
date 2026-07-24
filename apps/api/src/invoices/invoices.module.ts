import { Module } from '@nestjs/common';
import { FeeStructureModule } from '../fee-structure/fee-structure.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [FeeStructureModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
