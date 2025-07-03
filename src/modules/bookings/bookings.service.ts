import { Injectable } from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PrismaService } from 'core/prisma/prisma.service';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(createBookingDto: CreateBookingDto) {
    const newBooking = await this.prisma.booking.create({
      data: {
        ...createBookingDto,
        pickupLocation: {
          ...createBookingDto.pickupLocation,
        }

      },
    });
    return newBooking;
  }
}