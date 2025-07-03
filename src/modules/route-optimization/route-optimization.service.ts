import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Booking, BookingStatus, Driver, Prisma } from '@prisma/client';
import { OsrmService, Point } from 'core/orsm/orsm.service';
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

    // 3. Tìm một tài xế có sẵn
    const driver = await this.prisma.driver.findFirst(); // Logic tìm tài xế có thể phức tạp hơn
    if (!driver) {
      this.logger.warn('No available drivers found. Cannot create route.');
      return;
    }

    // 4. Chuẩn bị dữ liệu cho việc tính toán
    // Mảng `locations` sẽ có cấu trúc: [depot, booking1_location, booking2_location, ...]
    const locations: Point[] = [this.DEPOT_LOCATION];
    const locationIndexMap = new Map<string, number>(); // Map từ bookingId -> index trong `locations`

    validBookings.forEach((booking, index) => {
      locations.push(booking.pickupLocation as unknown as Point);
      // Index trong `locations` sẽ là `index + 1` (vì index 0 là depot)
      locationIndexMap.set(booking.id, index + 1);
    });

    // 5. Lấy ma trận thời gian từ OSRM
    const durationMatrix = await this.osrmService.getDurationMatrix(locations);

    // 6. Chạy thuật toán tối ưu để tìm thứ tự đón khách tốt nhất
    const optimizedBookings = this.solveWithGreedy(
      validBookings,
      durationMatrix,
    );

    try {
      // 7. Lưu lộ trình đã tối ưu vào database
      await this.saveRouteAndNotifyDriver(
        optimizedBookings,
        durationMatrix,
        locationIndexMap,
        driver,
      );
      this.logger.log('Successfully saved new route to the database.');
    } catch (error) {
      this.logger.error('Failed to save route', error.stack);
    }
  }

  /**
   * Lưu lộ trình đã được tối ưu vào database trong một transaction duy nhất.
   * @param optimizedBookings - Mảng các booking theo thứ tự đón tối ưu.
   * @param durationMatrix - Ma trận thời gian từ OSRM.
   * @param locationIndexMap - Map từ bookingId đến index của nó trong ma trận.
   * @param driver - Tài xế được gán cho lộ trình này.
   */
  private async saveRouteAndNotifyDriver(
    optimizedBookings: Booking[],
    durationMatrix: number[][],
    locationIndexMap: Map<string, number>,
    driver: Driver,
  ) {
    // Sử dụng transaction để đảm bảo tất cả các thao tác đều thành công hoặc không có gì cả.
    // Transaction này sẽ trả về thông tin lộ trình đầy đủ nếu thành công.
    const newRoute = await this.prisma.$transaction(async (tx) => {
      // Tạo record Route mới để lấy ID
      const createdRoute = await tx.route.create({
        data: {
          driverId: driver.id,
          totalDistance: 0, 
          totalDuration: 0, 
        },
      });

      // Tạo các điểm dừng (Stops) cho lộ trình
      const stopsToCreate: Prisma.StopCreateManyInput[] = [];
      let cumulativeDuration = 0;
      let lastLocationIndex = 0; // Index của điểm dừng trước đó, bắt đầu từ Depot (index 0)

      // Thêm điểm dừng đầu tiên: Depot
      stopsToCreate.push({
        routeId: createdRoute.id,
        type: 'DEPOT',
        location: this.DEPOT_LOCATION as unknown as Prisma.JsonObject,
        sequence: 1,
        eta: new Date(), // ETA tại depot là thời gian hiện tại
      });

      // Thêm các điểm dừng đón khách (PICKUP) theo thứ tự đã tối ưu
      for (const [index, booking] of optimizedBookings.entries()) {
        // Lấy index của booking trong ma trận gốc để tra cứu thời gian di chuyển
        const currentLocationIndex = locationIndexMap.get(booking.id)!;

        // Thời gian di chuyển từ điểm trước đó đến điểm hiện tại
        const travelDuration =
          durationMatrix[lastLocationIndex][currentLocationIndex];
        cumulativeDuration += travelDuration;

        stopsToCreate.push({
          routeId: createdRoute.id,
          bookingId: booking.id,
          type: 'PICKUP',
          location: booking.pickupLocation as unknown as Prisma.JsonObject,
          sequence: index + 2, // Sequence: Depot (1), Pickup 1 (2), Pickup 2 (3), ...
          // ETA = thời gian hiện tại + tổng thời gian di chuyển tích lũy (tính bằng giây)
          eta: new Date(Date.now() + cumulativeDuration * 1000),
        });

        // Cập nhật index của điểm dừng trước đó cho vòng lặp tiếp theo
        lastLocationIndex = currentLocationIndex;
      }

      await tx.stop.createMany({
        data: stopsToCreate,
      });

      // Cập nhật trạng thái các booking đã được gán vào lộ trình
      const bookingIds = optimizedBookings.map((b) => b.id);
      await tx.booking.updateMany({
        where: { id: { in: bookingIds } },
        data: { status: BookingStatus.ASSIGNED },
      });

      //
      // totalDuration là tổng thời gian từ depot đến điểm đón khách cuối cùng.
      await tx.route.update({
        where: { id: createdRoute.id },
        data: {
          totalDuration: cumulativeDuration,
          // totalDistance có thể được cập nhật tương tự nếu OSRM trả về ma trận khoảng cách
        },
      });

      // Lấy lại thông tin route đầy đủ để trả về từ transaction
      // Việc này đảm bảo dữ liệu gửi đi là mới nhất và bao gồm cả các stops.
      return tx.route.findUnique({
        where: { id: createdRoute.id },
        include: {
          stops: {
            orderBy: {
              sequence: 'asc',
            },
          },
        },
      });
    });

    // Sau khi transaction thành công, gửi thông báo real-time cho tài xế
    if (newRoute) {
      this.eventsGateway.sendNewRouteToDriver(driver.id, newRoute);
    }
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
