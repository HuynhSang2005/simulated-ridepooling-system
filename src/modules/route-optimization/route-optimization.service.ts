import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Booking,
  BookingStatus,
  Driver,
  DriverStatus,
  Prisma,
  RouteStatus,
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

interface StopToCreate {
  routeId: string;
  bookingId?: string;
  type: string;
  location: { lat: number; lng: number };
  sequence: number;
  eta: Date;
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
        dropoffAddress: true,    // Bỏ comment nếu đã có trong DB
        dropoffLocation: true,   // Bỏ comment nếu đã có trong DB
        status: true,
        createdAt: true,
      },
    });

    const validBookings = pendingBookings.filter((booking) => {
      const isValidPickup = isValidPoint(booking.pickupLocation);
      const isValidDropoff = isValidPoint(booking.dropoffLocation); // Bỏ comment nếu đã có
      
      if (!isValidPickup || !isValidDropoff) {
        this.logger.warn(
          `Booking ID ${booking.id} has invalid pickup/dropoff location. Skipping.`,
        );
      }
      return isValidPickup && isValidDropoff; // Sửa lại logic đầy đủ
    });

    if (validBookings.length === 0) {
      this.logger.debug('No valid pending bookings found. Skipping.');
      return;
    }
    this.logger.log(`Found ${validBookings.length} valid pending bookings.`);

    const depot: Point = this.DEPOT_LOCATION;

    // --- TẠO ĐÚNG CẢ PICKUP VÀ DROPOFF POINTS ---
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

    // Chuẩn bị danh sách tọa độ để gọi OSRM
    const locations: Point[] = [depot, ...pointsToVisit.map((p) => p.location)];
    const durationMatrix = await this.osrmService.getDurationMatrix(locations);

    // Chạy thuật toán tối ưu hóa lộ trình
    const optimizedStops = this.solveDarpWithGreedy(pointsToVisit, durationMatrix);

    this.logger.log('Optimized stops calculated:');
    optimizedStops.forEach((stop) => {
      this.logger.log(`- ${stop.type} for booking ...${stop.bookingId.slice(-4)}`);
    });

    // BỔ SUNG: Lưu route và tính ETA
    await this.saveRouteWithPredictions(optimizedStops, durationMatrix, depot);
  }

  private async saveRouteWithPredictions(
    optimizedStops: StopPoint[],
    durationMatrix: number[][],
    depot: Point,
  ) {
    // Tìm driver available
    const driver = await this.prisma.driver.findFirst({
      where: { status: DriverStatus.IDLE },
    });
    if (!driver) {
      this.logger.warn('No available drivers found.');
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // Tạo route
      const newRoute = await tx.route.create({
        data: {
          driverId: driver.id,
          totalDistance: 0,
          totalDuration: 0,
          status: RouteStatus.IN_PROGRESS,
        },
      });

      // Cập nhật driver status
      await tx.driver.update({
        where: { id: driver.id },
        data: { status: DriverStatus.ON_ROUTE },
      });

      const stopsToCreate: StopToCreate[] = [];
      let cumulativeDuration = 0;
      let currentIndex = 0; // Bắt đầu từ depot (index 0)
      const startTime = Date.now();

      // Depot stop (không có bookingId)
      stopsToCreate.push({
        routeId: newRoute.id,
        type: 'DEPOT',
        location: { ...depot },
        sequence: 1,
        eta: new Date(startTime),
      });

      // Các stops theo thứ tự tối ưu
      for (const [index, stop] of optimizedStops.entries()) {
        const nextIndex = index + 1; // index trong durationMatrix (bỏ qua depot)
        const travelDuration = durationMatrix[currentIndex][nextIndex];
        cumulativeDuration += travelDuration;

        stopsToCreate.push({
          routeId: newRoute.id,
          bookingId: stop.bookingId,
          type: stop.type,
          location: { ...stop.location },
          sequence: index + 2, // +2 vì depot là sequence 1
          eta: new Date(startTime + cumulativeDuration * 1000),
        });

        currentIndex = nextIndex; // Cập nhật vị trí hiện tại
      }

      await tx.stop.createMany({ data: stopsToCreate });

      // Cập nhật booking status và ETA predictions
      const bookingIds = [...new Set(optimizedStops.map(s => s.bookingId))];

      for (const bookingId of bookingIds) {
        const pickupStop = stopsToCreate.find(s => s.bookingId === bookingId && s.type === 'PICKUP');
        const dropoffStop = stopsToCreate.find(s => s.bookingId === bookingId && s.type === 'DROPOFF');

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.ASSIGNED,
            pickupETA: pickupStop?.eta,
            dropoffETA: dropoffStop?.eta,
            tripDuration: pickupStop?.eta && dropoffStop?.eta
              ? Math.round((dropoffStop.eta.getTime() - pickupStop.eta.getTime()) / 60000)
              : null,
          },
        });
      }

      // Cập nhật total duration cho route
      await tx.route.update({
        where: { id: newRoute.id },
        data: { totalDuration: cumulativeDuration },
      });

      // Gửi route mới cho driver
      this.eventsGateway.sendNewRouteToDriver(driver.id, {
        ...newRoute,
        stops: stopsToCreate,
      });

      this.logger.log(`Route ${newRoute.id} created and assigned to driver ${driver.id}`);
    });
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
}
