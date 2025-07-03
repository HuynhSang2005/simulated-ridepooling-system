import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from 'core/prisma/prisma.service';

@Injectable()
export class StopsService {
  constructor(private readonly prisma: PrismaService) {}

  async completeStop(stopId: string) {
    // Dùng transaction để đảm bảo cả stop và booking được cập nhật
    return this.prisma.$transaction(async (tx) => {
      const stop = await tx.stop.findUnique({ where: { id: stopId } });

      if (!stop) {
        throw new NotFoundException(`Stop with ID ${stopId} not found.`);
      }

      // Nếu điểm dừng này có liên kết với một booking (là điểm đón khách)
      if (stop.bookingId) {
        // Cập nhật trạng thái booking thành IN_PROGRESS (đã lên xe)
        await tx.booking.update({
          where: { id: stop.bookingId },
          data: { status: BookingStatus.IN_PROGRESS },
        });
      }

      // Có thể thêm logic cập nhật trạng thái của chính Stop nếu cần
      // Ví dụ: thêm một trường 'completedAt' vào model Stop

      return { message: `Stop ${stopId} has been marked as completed.` };
    });
  }
}