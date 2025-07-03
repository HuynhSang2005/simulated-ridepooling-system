import { Controller, Param, Patch } from '@nestjs/common';
import { StopsService } from './stop.service';

@Controller('stops')
export class StopsController {
  constructor(private readonly stopsService: StopsService) {}

  @Patch(':id/complete')
  completeStop(@Param('id') id: string) {
    return this.stopsService.completeStop(id);
  }
}