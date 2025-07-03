import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Booking, BookingStatus, Driver } from '@prisma/client';
import { OsrmService, Point } from 'core/orsm/orsm.service';
import { PrismaService } from 'core/prisma/prisma.service';

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly osrmService: OsrmService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    this.logger.debug('Running route optimization job...');


    // 1. Lấy tất cả các booking đang chờ
    const pendingBookings = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING },
    });

    // 2. Nếu không có đủ booking, bỏ qua lần chạy này
    if (pendingBookings.length < 2) {
      this.logger.debug('Not enough pending bookings. Skipping.');
      return;
    }

    this.logger.log(`Found ${pendingBookings.length} pending bookings.`);

    // 3. Định nghĩa điểm xuất phát (Depot)
    // Ví dụ: Lấy Bưu điện Trung tâm Sài Gòn làm điểm xuất phát
    const depot: Point = { lat: 10.779722, lng: 106.699444 };

    // 4. Chuẩn bị danh sách các điểm cần tính toán
    // Điểm đầu tiên (index 0) luôn là depot
    const locations: Point[] = [
      depot,
      ...pendingBookings.map(
        (booking) => booking.pickupLocation as unknown as Point,
      ),
    ];

    // 5. Gọi OSRM để lấy ma trận thời gian
    const durationMatrix = await this.osrmService.getDurationMatrix(locations);

    this.logger.debug('Duration Matrix received from OSRM:');
    console.log(durationMatrix); // Log ma trận để kiểm tra

    // 6. Chạy thuật toán tối ưu để tìm lộ trình
    const optimizedRoute = this.solveWithGreedy(
      pendingBookings,
      durationMatrix,
    );
    this.logger.log(`Optimized route: ${optimizedRoute.map((b) => b.id)}`);

    this.logger.log('Optimized route calculated:');
    // Log ra ID của các booking theo thứ tự đã tối ưu
    console.log(optimizedRoute.map((booking) => booking.id));

    try {
      await this.saveRoute(optimizedRoute, durationMatrix);
      this.logger.log('Successfully saved new route to the database.');
    } catch (error) {
      this.logger.error('Failed to save route', error.stack);
    }

  }

  private async saveRoute(
    bookings: Booking[],
    durationMatrix: number[][],
  ) {
    // Giả định chúng ta có một tài xế để gán tuyến
    // Trong thực tế, bạn sẽ có logic để tìm tài xế đang rảnh
    // TODO: Thay thế bằng logic tìm tài xế thực tế
    const driver = await this.prisma.driver.findFirst();
    if (!driver) {
      this.logger.warn('No available drivers found. Cannot assign route.');
      return;
    }

    // Sử dụng transaction để đảm bảo tất cả các thao tác đều thành công
    await this.prisma.$transaction(async (tx) => {
      // a. Tạo bản ghi Route mới
      const newRoute = await tx.route.create({
        data: {
          driverId: driver.id,
          totalDistance: 0, // Sẽ cập nhật sau
          totalDuration: 0, // Sẽ cập nhật sau
        },
      });

      // Logic tạo Stop và cập nhật Booking sẽ được thêm vào đây...
    });
  }

  private solveWithGreedy(
    bookings: Booking[],
    durationMatrix: number[][],
  ): Booking[] {
    if (bookings.length === 0) {
      return [];
    }

    const numLocations = bookings.length + 1; // +1 cho depot
    const visited = new Array(numLocations).fill(false);
    const route: Booking[] = [];

    // Bắt đầu từ depot (index 0)
    let currentLocationIndex = 0;
    visited[currentLocationIndex] = true;

    for (let i = 0; i < bookings.length; i++) {
      let nearestNeighborIndex = -1;
      let minDuration = Infinity;

      // Tìm điểm chưa thăm gần nhất từ vị trí hiện tại
      for (let j = 1; j < numLocations; j++) {
        // Bắt đầu từ 1 vì 0 là depot
        if (
          !visited[j] &&
          durationMatrix[currentLocationIndex][j] < minDuration
        ) {
          minDuration = durationMatrix[currentLocationIndex][j];
          nearestNeighborIndex = j;
        }
      }

      // Cập nhật vị trí và thêm booking vào lộ trình
      visited[nearestNeighborIndex] = true;
      // Index của booking trong mảng `bookings` là `nearestNeighborIndex - 1`
      route.push(bookings[nearestNeighborIndex - 1]);
      currentLocationIndex = nearestNeighborIndex;
    }

    return route;
  }
}
