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

interface StopPoint {
  bookingId: string;
  type: 'PICKUP' | 'DROPOFF';
  location: Point;
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
      select: {
        id: true,
        userId: true,
        pickupAddress: true,
        pickupLocation: true,
        dropoffLocation: true, 
        status: true,
        createdAt: true,
      },
    });

    const validBookings = pendingBookings.filter((booking) => {
      const isValidPickup = isValidPoint(booking.pickupLocation);
      const isValidDropoff = isValidPoint(booking.dropoffLocation);
      if (!isValidPickup || !isValidDropoff) {
        this.logger.warn(
          `Booking ID ${booking.id} has invalid pickup/dropoff location. Skipping.`,
        );
      }
      return isValidPickup && isValidDropoff;
    });

    if (validBookings.length === 0) {
      this.logger.debug('No valid pending bookings found. Skipping.');
      return;
    }
    this.logger.log(`Found ${validBookings.length} valid pending bookings.`);

    const depot: Point = this.DEPOT_LOCATION;

    // --- LOGIC MỚI: Tạo danh sách các điểm dừng (pickup & dropoff) ---
    const pointsToVisit: StopPoint[] = [];
    validBookings.forEach((booking) => {
      pointsToVisit.push({
        bookingId: booking.id,
        type: 'PICKUP',
        location: booking.pickupLocation as unknown as Point,
      });
      pointsToVisit.push({
        bookingId: booking.id,
        type: 'DROPOFF',
        location: booking.dropoffLocation as unknown as Point,
      });
    });

    // 2. Chuẩn bị danh sách tọa độ để gọi OSRM
    const locations: Point[] = [depot, ...pointsToVisit.map((p) => p.location)];
    const durationMatrix = await this.osrmService.getDurationMatrix(locations);

    // 3. Chạy thuật toán tối ưu mới
    const optimizedStops = this.solveDarpWithGreedy(pointsToVisit, durationMatrix);

    this.logger.log('Optimized stops calculated:');
    optimizedStops.forEach((stop) => {
      this.logger.log(`- ${stop.type} for booking ...${stop.bookingId.slice(-4)}`);
    });

    // TODO: Cập nhật logic saveRoute để lưu theo cấu trúc mới (pickup & dropoff)
  }

  /**
   * Thuật toán tham lam cho DARP (Pickup & Dropoff).
   * @param pointsToVisit - Danh sách các điểm dừng (pickup & dropoff).
   * @param durationMatrix - Ma trận thời gian di chuyển.
   * @returns Mảng các điểm dừng đã được sắp xếp tối ưu.
   */
  private solveDarpWithGreedy(
    pointsToVisit: StopPoint[],
    durationMatrix: number[][],
  ): StopPoint[] {
    const numPoints = pointsToVisit.length;
    const pointsMap = new Map<number, StopPoint>(
      pointsToVisit.map((p, i) => [i + 1, p]) // index 0 là depot
    );

    const passengersOnBoard = new Set<string>();
    const visitedPointIndices = new Set<number>();
    const finalRoute: StopPoint[] = [];

    let currentLocationIndex = 0; // Bắt đầu từ depot

    while (finalRoute.length < numPoints) {
      let nearestNeighborMatrixIndex = -1;
      let minDuration = Infinity;

      for (let i = 1; i <= numPoints; i++) {
        if (visitedPointIndices.has(i)) continue;
        const pointInfo = pointsMap.get(i);
        if (!pointInfo) continue;

        let isActionValid = false;

        if (pointInfo.type === 'PICKUP') {
          isActionValid = true;
        } else if (
          pointInfo.type === 'DROPOFF' &&
          passengersOnBoard.has(pointInfo.bookingId)
        ) {
          isActionValid = true;
        }

        if (isActionValid) {
          const duration = durationMatrix[currentLocationIndex][i];
          if (duration < minDuration) {
            minDuration = duration;
            nearestNeighborMatrixIndex = i;
          }
        }
      }

      if (nearestNeighborMatrixIndex === -1) break;

      const chosenPoint = pointsMap.get(nearestNeighborMatrixIndex);
      if (!chosenPoint) break;

      finalRoute.push(chosenPoint);
      visitedPointIndices.add(nearestNeighborMatrixIndex);

      if (chosenPoint.type === 'PICKUP') {
        passengersOnBoard.add(chosenPoint.bookingId);
      } else {
        passengersOnBoard.delete(chosenPoint.bookingId);
      }

      currentLocationIndex = nearestNeighborMatrixIndex;
    }

    return finalRoute;
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
