import { Module } from '@nestjs/common';
import { RouteOptimizationService } from './route-optimization.service';

@Module({
  providers: [RouteOptimizationService],
  exports: [RouteOptimizationService],
})
export class RouteOptimizationModule {}
