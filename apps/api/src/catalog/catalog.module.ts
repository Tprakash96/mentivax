import { Module } from '@nestjs/common';
import { ClassesController, FeeTypesController } from './catalog.controller';

@Module({ controllers: [ClassesController, FeeTypesController] })
export class CatalogModule {}
