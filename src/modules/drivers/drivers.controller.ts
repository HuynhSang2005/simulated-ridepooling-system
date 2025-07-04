import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  create(@Body() createDriverDto: CreateDriverDto) {
    return this.driversService.create(createDriverDto);
  }

  @Get()
  findAll() {
    return this.driversService.findAll();
  }

  @Get(':driverId/active-route')
  getActiveRoute(@Param('driverId') driverId: string) {
    return this.driversService.getActiveRoute(driverId);
  }

}