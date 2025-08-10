import { Module } from '@nestjs/common';
import { XscrapperService } from './xscrapper.service';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from 'src/database/schemas/account.schema';
import { XscrapperController } from './xscrapper.controller';
import { BotService } from './bot.service';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
  ],
  providers: [XscrapperService, BotService],
  controllers: [XscrapperController],
})
export class XscrapperModule {}
