import { Injectable } from '@nestjs/common';
import { CreateDriverDto } from './dto/create-driver.dto';
import { PrismaService } from 'core/prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  create(createDriverDto: CreateDriverDto) {
    return this.prisma.driver.create({ data: createDriverDto });
  }

  findAll() {
    return this.prisma.driver.findMany();
  }
}