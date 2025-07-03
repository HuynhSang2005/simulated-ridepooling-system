import { Module } from '@nestjs/common';
import { StopsService } from './stop.service';
import { StopsController } from './stop.controller';

@Module({
  controllers: [StopsController],
  providers: [StopsService],
})
export class StopModule {}
