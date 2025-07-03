import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from 'core/prisma/prisma.module';
import { OsrmModule } from 'core/orsm/osrm.module';
import { BookingsController } from './modules/bookings/bookings.controller';

@Module({
  imports: [PrismaModule, OsrmModule, BookingsController, RouteOptimizationModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
