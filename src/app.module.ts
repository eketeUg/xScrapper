import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { XscrapperModule } from './xscrapper/xscrapper.module';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [XscrapperModule, DatabaseModule, ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
