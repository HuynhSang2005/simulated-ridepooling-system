import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'core/prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({ data: createUserDto });
  }

  findAll() {
    return this.prisma.user.findMany();
  }

  async getActiveBooking(userId: string) {
    const activeBooking = await this.prisma.booking.findFirst({
      where: {
        userId: userId,
        status: {
          in: [BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS],
        },
      },
      include: {
        stops: {
          include: {
            route: {
              include: {
                driver: true, // Lấy thông tin tài xế
                stops: {    // Lấy tất cả các điểm dừng của lộ trình
                  orderBy: {
                    sequence: 'asc',
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!activeBooking) {
      throw new NotFoundException(`No active booking found for user ${userId}`);
    }

    return activeBooking;
  }

}