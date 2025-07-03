import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { DriverStatusService } from './driver-status.service';

@Global()
@Module({
  providers: [EventsGateway, DriverStatusService],
  exports: [EventsGateway], 
})
export class EventsModule {}