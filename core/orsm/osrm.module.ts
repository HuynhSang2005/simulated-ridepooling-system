import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { OsrmService } from './orsm.service';

@Global()
@Module({
  imports: [HttpModule], 
  providers: [OsrmService],
  exports: [OsrmService],
})
export class OsrmModule {}