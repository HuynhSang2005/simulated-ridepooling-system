import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateDriverDto } from './dto/create-driver.dto';
import { PrismaService } from 'core/prisma/prisma.service';
import { DriverStatus, RouteStatus } from '@prisma/client';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  create(createDriverDto: CreateDriverDto) {
    return this.prisma.driver.create({ data: createDriverDto });
  }

  findAll() {
    return this.prisma.driver.findMany();
  }

  async getActiveRoute(driverId: string) {
    const activeRoute = await this.prisma.route.findFirst({
      where: {
        driverId: driverId,
        status: RouteStatus.IN_PROGRESS,
      },
      include: {
        stops: {
          orderBy: {
            sequence: 'asc',
          },
          include: {
            booking: { // Lấy thông tin booking tại mỗi điểm dừng
              include: {
                user: { // Lấy thông tin người dùng
                  select: { name: true }
                }
              }
            }
          }
        },
      },
    });

    if (!activeRoute) {
      throw new NotFoundException(`No active route found for driver ${driverId}`);
    }
    return activeRoute;
  }

}