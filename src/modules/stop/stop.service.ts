import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, DriverStatus, RouteStatus } from '@prisma/client';
import { PrismaService } from 'core/prisma/prisma.service';

@Injectable()
export class StopsService {
  constructor(private readonly prisma: PrismaService) {}

  async completeStop(stopId: string) {
    // Dùng transaction để đảm bảo cả stop và booking được cập nhật
    return this.prisma.$transaction(async (tx) => {
      const updatedStop = await tx.stop.update({
        where: { id: stopId },
        data: { completedAt: new Date() },
      });

      // Nếu điểm dừng này là một điểm đón khách, cập nhật booking
      if (!updatedStop) {
        throw new NotFoundException(`Stop with ID ${stopId} not found.`);
      }

       // 3. Kiểm tra xem đây có phải là điểm dừng cuối cùng của lộ trình không
      const routeId = updatedStop.routeId;
      const totalStops = await tx.stop.count({ where: { routeId } });
      const completedStops = await tx.stop.count({
        where: { routeId, completedAt: { not: null } },
      });

      // Nếu tất cả các điểm dừng đã hoàn thành
      if (totalStops === completedStops) {
        // Lấy thông tin route để biết driverId
        const route = await tx.route.findUnique({ where: { id: routeId } });

        if (route) {
          // Cập nhật trạng thái của Route thành COMPLETED
          await tx.route.update({
            where: { id: routeId },
            data: { status: RouteStatus.COMPLETED },
          });

          // Cập nhật trạng thái của Driver về lại IDLE
          await tx.driver.update({
            where: { id: route.driverId },
            data: { status: DriverStatus.IDLE },
          });

          // Cập nhật trạng thái của tất cả các booking trong lộ trình thành COMPLETED
          const bookingsOnRoute = await tx.booking.findMany({
            where: { stops: { some: { routeId: routeId } } },
          });
          const bookingIds = bookingsOnRoute.map((b) => b.id);
          await tx.booking.updateMany({
            where: { id: { in: bookingIds } },
            data: { status: BookingStatus.COMPLETED },
          });
        }
      }

      return { message: `Stop ${stopId} has been marked as completed.` };

    });
  }
}