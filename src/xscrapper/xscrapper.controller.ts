import { Body, Controller, Get, Post } from '@nestjs/common';
import { XscrapperService } from './xscrapper.service';

@Controller('xscrapper')
export class XscrapperController {
  constructor(private readonly xscrapperService: XscrapperService) {}

  @Get()
  scrapData() {
    return this.xscrapperService.scrapeData('solana', 'Top');
  }

  @Post()
  createPostSchemaOnly(@Body() payload: any) {
    return this.xscrapperService.getTelegramHandleStatus(payload.username);
  }
}
