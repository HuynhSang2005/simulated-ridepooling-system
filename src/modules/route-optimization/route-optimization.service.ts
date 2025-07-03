import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  // sẽ auto run mỗi 30 giây
  @Cron(CronExpression.EVERY_5_SECONDS)
  handleCron() {
    this.logger.debug('Running route optimization job...');
  }
}