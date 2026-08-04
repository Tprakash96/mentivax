import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [ExpensesModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
