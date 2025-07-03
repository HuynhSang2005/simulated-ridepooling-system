import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Booking ,BookingStatus } from '@prisma/client';
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
      ...pendingBookings.map((booking) => booking.pickupLocation as unknown as Point),
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

    this.logger.log('Optimized route calculated:');
    // Log ra ID của các booking theo thứ tự đã tối ưu
    console.log(optimizedRoute.map((booking) => booking.id));

    // Logic tiếp theo: Lưu lộ trình này vào DB
  }

  // --- THÊM PHƯƠNG THỨC MỚI ---
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
      for (let j = 1; j < numLocations; j++) { // Bắt đầu từ 1 vì 0 là depot
        if (!visited[j] && durationMatrix[currentLocationIndex][j] < minDuration) {
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