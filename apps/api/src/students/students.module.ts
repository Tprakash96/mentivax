import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentDocumentsController } from './student-documents.controller';
import { StudentDocumentsService } from './student-documents.service';
import { DocumentTypesController } from './document-types.controller';
import { DocumentTypesService } from './document-types.service';

@Module({
  imports: [InvoicesModule],
  controllers: [StudentsController, StudentDocumentsController, DocumentTypesController],
  providers: [StudentsService, StudentDocumentsService, DocumentTypesService],
  exports: [StudentsService],
})
export class StudentsModule {}
