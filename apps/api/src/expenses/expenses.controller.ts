import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  createAccountSchema,
  createCategorySchema,
  createLedgerEntrySchema,
  createVendorSchema,
  expenseSettingsSchema,
  updateAccountSchema,
  updateCategorySchema,
  updateLedgerEntrySchema,
  updateVendorSchema,
  type CreateAccountDto,
  type CreateCategoryDto,
  type CreateLedgerEntryDto,
  type CreateVendorDto,
  type ExpenseSettingsDto,
  type UpdateAccountDto,
  type UpdateCategoryDto,
  type UpdateLedgerEntryDto,
  type UpdateVendorDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { ExpensesService } from './expenses.service';

@RequiresModule('expenses')
@UseGuards(ModuleGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  // --- Day book -----------------------------------------------------------

  @Get('overview')
  @RequirePermissions('expenses:read')
  overview(@Tenant() t: TenantContext, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.overview(t, { from, to });
  }

  @Get('entries')
  @RequirePermissions('expenses:read')
  entries(
    @Tenant() t: TenantContext,
    @Query('kind') kind?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listEntries(t, { kind, accountId, categoryId, status, from, to, search });
  }

  @Post('entries')
  @RequirePermissions('expenses:write')
  createEntry(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(createLedgerEntrySchema)) dto: CreateLedgerEntryDto,
  ) {
    return this.service.createEntry(t, dto);
  }

  @Patch('entries/:id')
  @RequirePermissions('expenses:write')
  updateEntry(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateLedgerEntrySchema)) dto: UpdateLedgerEntryDto,
  ) {
    return this.service.updateEntry(t, id, dto);
  }

  @Delete('entries/:id')
  @RequirePermissions('expenses:delete')
  removeEntry(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.removeEntry(t, id);
  }

  @Post('entries/:id/approve')
  @RequirePermissions('expenses:approve')
  approve(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.approveEntry(t, id);
  }

  @Post('entries/:id/reject')
  @RequirePermissions('expenses:approve')
  reject(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.rejectEntry(t, id);
  }

  // --- Statement & reports ------------------------------------------------

  @Get('statement')
  @RequirePermissions('expenses:read')
  statement(
    @Tenant() t: TenantContext,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.statement(t, { accountId, from, to });
  }

  @Get('report')
  @RequirePermissions('expenses:read')
  report(@Tenant() t: TenantContext) {
    return this.service.report(t);
  }

  // --- Accounts -----------------------------------------------------------

  @Get('accounts')
  @RequirePermissions('expenses:read')
  accounts(@Tenant() t: TenantContext) {
    return this.service.listAccounts(t);
  }

  @Post('accounts')
  @RequirePermissions('expenses:manage')
  createAccount(@Tenant() t: TenantContext, @Body(new ZodBody(createAccountSchema)) dto: CreateAccountDto) {
    return this.service.createAccount(t, dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions('expenses:manage')
  updateAccount(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateAccountSchema)) dto: UpdateAccountDto,
  ) {
    return this.service.updateAccount(t, id, dto);
  }

  @Delete('accounts/:id')
  @RequirePermissions('expenses:manage')
  removeAccount(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.removeAccount(t, id);
  }

  // --- Categories ---------------------------------------------------------

  @Get('categories')
  @RequirePermissions('expenses:read')
  categories(@Tenant() t: TenantContext) {
    return this.service.listCategories(t);
  }

  @Post('categories')
  @RequirePermissions('expenses:manage')
  createCategory(@Tenant() t: TenantContext, @Body(new ZodBody(createCategorySchema)) dto: CreateCategoryDto) {
    return this.service.createCategory(t, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('expenses:manage')
  updateCategory(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return this.service.updateCategory(t, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('expenses:manage')
  removeCategory(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.removeCategory(t, id);
  }

  // --- Vendors ------------------------------------------------------------

  @Get('vendors')
  @RequirePermissions('expenses:read')
  vendors(@Tenant() t: TenantContext) {
    return this.service.listVendors(t);
  }

  @Post('vendors')
  @RequirePermissions('expenses:manage')
  createVendor(@Tenant() t: TenantContext, @Body(new ZodBody(createVendorSchema)) dto: CreateVendorDto) {
    return this.service.createVendor(t, dto);
  }

  @Patch('vendors/:id')
  @RequirePermissions('expenses:manage')
  updateVendor(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateVendorSchema)) dto: UpdateVendorDto,
  ) {
    return this.service.updateVendor(t, id, dto);
  }

  @Delete('vendors/:id')
  @RequirePermissions('expenses:manage')
  removeVendor(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.removeVendor(t, id);
  }

  // --- Settings -----------------------------------------------------------

  @Get('settings')
  @RequirePermissions('expenses:read')
  settings(@Tenant() t: TenantContext) {
    return this.service.getSettings(t);
  }

  @Put('settings')
  @RequirePermissions('expenses:manage')
  saveSettings(@Tenant() t: TenantContext, @Body(new ZodBody(expenseSettingsSchema)) dto: ExpenseSettingsDto) {
    return this.service.saveSettings(t, dto);
  }
}
