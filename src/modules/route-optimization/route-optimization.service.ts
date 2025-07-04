import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Booking,
  BookingStatus,
  Driver,
  DriverStatus,
  Prisma,
} from '@prisma/client';
import { OsrmService, Point } from 'core/osrm/orsm.service';
import { PrismaService } from 'core/prisma/prisma.service';
import { EventsGateway } from 'src/events/events.gateway';

// Helper function (type guard) để xác thực cấu trúc của một Point.
function isValidPoint(data: unknown): data is Point {
  return (
    typeof data === 'object' &&
    data !== null &&
    'lat' in data &&
    'lng' in data &&
    typeof (data as Point).lat === 'number' &&
    typeof (data as Point).lng === 'number'
  );
}

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  private readonly DEPOT_LOCATION: Point = { lat: 10.779722, lng: 106.699444 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly osrmService: OsrmService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    this.logger.debug('Running route optimization job...');

    // 1. Lấy các booking đang chờ và lọc ra những booking có vị trí hợp lệ
    const pendingBookings = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING },
    });

    const validBookings = pendingBookings.filter((booking) => {
      const isValid = isValidPoint(booking.pickupLocation);
      if (!isValid) {
        this.logger.warn(
          `Booking ID ${booking.id} has invalid pickupLocation. Skipping.`,
        );
      }
      return isValid;
    });

    // 2. Kiểm tra xem có đủ booking hợp lệ để tạo lộ trình không
    if (validBookings.length === 0) {
      this.logger.debug('No valid pending bookings found. Skipping.');
      return;
    }
    this.logger.log(`Found ${validBookings.length} valid pending bookings.`);

    const depot: Point = { lat: 10.779722, lng: 106.699444 };
    const endPoint: Point = { lat: 10.8411, lng: 106.8099 }; // Ví dụ: KTX Khu B ĐHQG

    // Chuẩn bị danh sách các điểm, bao gồm cả điểm cuối
    const locations: Point[] = [
      depot,
      ...validBookings.map(
        (booking) => booking.pickupLocation as unknown as Point,
      ),
      endPoint,
    ];

    // 5. Lấy ma trận thời gian từ OSRM
    const durationMatrix = await this.osrmService.getDurationMatrix(locations);

    // 6. Chạy thuật toán tối ưu để tìm thứ tự đón khách tốt nhất
    const optimizedBookings = this.solveWithGreedy(
      validBookings,
      durationMatrix,
    );

    try {
      // Truyền thêm endPoint và depot vào hàm saveRoute
      await this.saveRoute(optimizedBookings, durationMatrix, depot, endPoint);
      this.logger.log('Successfully saved new route with endpoint.');
    } catch (error) {
      this.logger.error('Failed to save route', error.stack);
    }
  }

  /**
   * Lưu lộ trình đã được tối ưu vào database trong một transaction duy nhất, có thêm điểm cuối ENDPOINT.
   * @param optimizedBookings - Mảng các booking theo thứ tự đón tối ưu.
   * @param durationMatrix - Ma trận thời gian từ OSRM.
   * @param depot - Điểm xuất phát (Depot).
   * @param endPoint - Điểm cuối chung cho tất cả chuyến đi.
   */
  private async saveRoute(
    optimizedBookings: Booking[],
    durationMatrix: number[][],
    depot: Point,
    endPoint: Point,
  ) {
    // Tìm một tài xế có sẵn
    const driver = await this.prisma.driver.findFirst({
      where: {
        status: DriverStatus.IDLE, // Chỉ lấy tài xế đang rảnh
      },
    });
    if (!driver) {
      this.logger.warn('No available drivers found. Cannot create route.');
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // Tạo record Route mới để lấy ID
      const newRoute = await tx.route.create({
        data: {
          driverId: driver.id,
          totalDistance: 0,
          totalDuration: 0,
        },
      });

      // Cập nhật trạng thái của tài xế thành ON_ROUTE
      await tx.driver.update({
        where: { id: driver.id },
        data: { status: DriverStatus.ON_ROUTE },
      });

      // Tạo các điểm dừng (Stops) cho lộ trình
      const stopsToCreate: Prisma.StopCreateManyInput[] = [];
      let cumulativeDuration = 0;
      let lastLocationIndex = 0; // Index của điểm dừng trước đó, bắt đầu từ Depot (index 0)

      // Thêm điểm dừng đầu tiên: Depot
      stopsToCreate.push({
        routeId: newRoute.id,
        type: 'DEPOT',
        location: depot as unknown as Prisma.JsonObject,
        sequence: 1,
        eta: new Date(),
      });

      // Thêm các điểm dừng đón khách (PICKUP) theo thứ tự đã tối ưu
      for (const [index, booking] of optimizedBookings.entries()) {
        const currentLocationIndex = index + 1; // index 0 là depot, các booking bắt đầu từ 1
        const travelDuration =
          durationMatrix[lastLocationIndex][currentLocationIndex];
        cumulativeDuration += travelDuration;

        stopsToCreate.push({
          routeId: newRoute.id,
          bookingId: booking.id,
          type: 'PICKUP',
          location: booking.pickupLocation as unknown as Prisma.JsonObject,
          sequence: index + 2, // Depot (1), Pickup 1 (2), ...
          eta: new Date(Date.now() + cumulativeDuration * 1000),
        });

        lastLocationIndex = currentLocationIndex;
      }

      // --- LOGIC MỚI: Thêm điểm dừng cuối cùng là ENDPOINT ---
      const endPointLocationIndex = durationMatrix.length - 1;
      cumulativeDuration +=
        durationMatrix[lastLocationIndex][endPointLocationIndex];
      stopsToCreate.push({
        routeId: newRoute.id,
        bookingId: null,
        type: 'ENDPOINT',
        location: endPoint as unknown as Prisma.JsonObject,
        sequence: stopsToCreate.length + 1,
        eta: new Date(Date.now() + cumulativeDuration * 1000),
      });

      await tx.stop.createMany({ data: stopsToCreate });

      // Cập nhật trạng thái các booking đã được gán vào lộ trình
      const bookingIds = optimizedBookings.map((b) => b.id);
      await tx.booking.updateMany({
        where: { id: { in: bookingIds } },
        data: { status: BookingStatus.ASSIGNED },
      });

      // Cập nhật tổng thời gian cho route
      await tx.route.update({
        where: { id: newRoute.id },
        data: {
          totalDuration: cumulativeDuration,
        },
      });
    });
  }

  /**
   * Giải quyết bài toán bằng thuật toán tham lam (Greedy - Nearest Neighbor).
   * @param bookings - Danh sách các booking cần sắp xếp.
   * @param durationMatrix - Ma trận thời gian di chuyển.
   * @returns Mảng các booking đã được sắp xếp theo thứ tự tối ưu.
   */
  private solveWithGreedy(
    bookings: Booking[],
    durationMatrix: number[][],
  ): Booking[] {
    if (bookings.length === 0) {
      return [];
    }

    const numLocations = durationMatrix.length;
    const visited = new Array(numLocations).fill(false);
    const optimizedRoute: Booking[] = [];

    // Luôn bắt đầu từ Depot (có index là 0 trong ma trận)
    let currentLocationIndex = 0;
    visited[currentLocationIndex] = true;

    // Lặp lại để tìm đủ N điểm đến cho N booking
    for (let i = 0; i < bookings.length; i++) {
      let nearestNeighborIndex = -1;
      let minDuration = Infinity;

      // Tìm điểm đến (chưa được thăm) gần nhất từ vị trí hiện tại
      for (let j = 1; j < numLocations; j++) {
        // Bỏ qua depot (j=0) và các điểm đã thăm
        if (
          !visited[j] &&
          durationMatrix[currentLocationIndex][j] < minDuration
        ) {
          minDuration = durationMatrix[currentLocationIndex][j];
          nearestNeighborIndex = j;
        }
      }

      // Thêm booking tương ứng với điểm gần nhất vào lộ trình
      visited[nearestNeighborIndex] = true;
      // Index trong mảng `bookings` là `nearestNeighborIndex - 1` vì ma trận có thêm depot ở đầu
      optimizedRoute.push(bookings[nearestNeighborIndex - 1]);
      currentLocationIndex = nearestNeighborIndex;
    }

    return optimizedRoute;
  }
}
