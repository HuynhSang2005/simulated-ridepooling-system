import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingsService.createBooking(createBookingDto);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findBookingById(id);
  }

  @Get(':id/predictions')
  async getBookingPredictions(@Param('id') id: string) {
    return this.bookingsService.getBookingPredictions(id);
  }
}