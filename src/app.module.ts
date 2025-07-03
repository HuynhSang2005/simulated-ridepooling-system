import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from 'core/prisma/prisma.module';
import { OsrmModule } from 'core/orsm/osrm.module';
import { RouteOptimizationModule } from './modules/route-optimization/route-optimization.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingsModule } from './modules/bookings/bookings.module';
import { EventsGateway } from './events/events.gateway';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    OsrmModule,
    BookingsModule,
    RouteOptimizationModule,
  ],
  controllers: [AppController],
  providers: [EventsGateway],
})
export class AppModule {}
