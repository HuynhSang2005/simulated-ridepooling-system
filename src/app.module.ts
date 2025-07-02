import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from 'core/prisma/prisma.module';
import { OsrmModule } from 'core/orsm/osrm.module';

@Module({
  imports: [PrismaModule, OsrmModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
