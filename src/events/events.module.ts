import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { ConnectionStatusService } from './connection-status.service';

@Global()
@Module({
  providers: [EventsGateway, ConnectionStatusService],
  exports: [EventsGateway], 
})
export class EventsModule {}