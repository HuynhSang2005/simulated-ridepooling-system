import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PrismaService } from 'core/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(createBookingDto: CreateBookingDto) {
    const newBooking = await this.prisma.booking.create({
      data: {
        ...createBookingDto,
        pickupLocation: createBookingDto.pickupLocation as unknown as Prisma.InputJsonValue,
        dropoffLocation: createBookingDto.dropoffLocation as unknown as Prisma.InputJsonValue, 
        pickupAddress: createBookingDto.pickupAddress,      
      },
    });
    return newBooking;
  }

  async findBookingById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    return booking;
  }

  async getBookingPredictions(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        pickupETA: true,
        dropoffETA: true,
        tripDuration: true,
        pickupAddress: true,
        dropoffAddress: true,
        stops: { // Đổi từ stop sang stops
          include: {
            route: {
              include: {
                driver: {
                  select: { id: true, name: true }
                }
              }
            }
          }
        }
      }
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    // Lấy driver từ stop đầu tiên (nếu có)
    const driver = booking.stops?.[0]?.route?.driver || null;

    return {
      bookingId: booking.id,
      status: booking.status,
      pickupETA: booking.pickupETA,
      dropoffETA: booking.dropoffETA,
      tripDuration: booking.tripDuration,
      estimatedPickupTime: booking.pickupETA 
        ? `${Math.round((new Date(booking.pickupETA).getTime() - Date.now()) / 60000)} phút nữa`
        : 'Chưa có dự đoán',
      estimatedTripDuration: booking.tripDuration 
        ? `${booking.tripDuration} phút`
        : 'Chưa có dự đoán',
      driver,
    };
  }
}