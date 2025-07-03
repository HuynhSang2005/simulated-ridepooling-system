import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from 'core/prisma/prisma.service';

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    this.logger.debug('Running route optimization job...');

    // 1. Lấy tất cả các booking đang chờ
    const pendingBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
      },
    });

    // 2. Nếu không có đủ booking, bỏ qua lần chạy này
    //  Đ0ặt ngưỡng tối thiểu, hiện tại thì sẽ ví dụ là 2 booking
    if (pendingBookings.length < 2) {
      this.logger.debug('Not enough pending bookings to create a route. Skipping.');
      return;
    }

    this.logger.log(`Found ${pendingBookings.length} pending bookings to process.`);
  }
}