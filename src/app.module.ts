import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from 'core/prisma/prisma.module';
import { OsrmModule } from 'core/osrm/osrm.module';
import { RouteOptimizationModule } from './modules/route-optimization/route-optimization.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingsModule } from './modules/bookings/bookings.module';
import { EventsGateway } from './events/events.gateway';
import { EventsModule } from './events/events.module';
import { UsersModule } from './modules/users/users.module';
import { DriversModule } from './modules/drivers/drivers.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    OsrmModule,
    EventsModule,
    RouteOptimizationModule,
    BookingsModule,
    UsersModule,
    DriversModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
