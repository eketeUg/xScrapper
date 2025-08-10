import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { HttpService } from '@nestjs/axios';
import * as dotenv from 'dotenv';
import { accountMarkUp, menuMarkup, welcomeMessageMarkup } from './markups';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';
import { Account, AccountDocument } from 'src/database/schemas/account.schema';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;

@Injectable()
export class BotService {
  private readonly bot: TelegramBot;
  private logger = new Logger(BotService.name);
  private currentKeyIndex = 0;
  private key;
  private isRunning = false;

  constructor(
    private readonly httpService: HttpService,
    @InjectModel(Account.name) private readonly AccountModel: Model<Account>,
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.bot.on('message', this.handleRecievedMessages);
    this.bot.on('callback_query', this.handleButtonCommands);
  }

  handleRecievedMessages = async (
    msg: TelegramBot.Message,
  ): Promise<unknown> => {
    // this.logger.debug(msg);
    try {
      await this.bot.sendChatAction(msg.chat.id, 'typing');

      if (msg.text.trim() === '/start') {
        const username: string = `${msg.from.username}`;
        const welcome = await welcomeMessageMarkup(username);
        const replyMarkup = {
          inline_keyboard: welcome.keyboard,
        };
        return await this.bot.sendMessage(msg.chat.id, welcome.message, {
          reply_markup: replyMarkup,
        });
      } else if (msg.text.trim() === '/menu') {
        return await this.defaultMenu(msg.chat.id);
      }
    } catch (error) {
      console.log(error);
      return await this.bot.sendMessage(
        msg.chat.id,
        'There was an error processing your message',
      );
    }
  };

  handleButtonCommands = async (
    query: TelegramBot.CallbackQuery,
  ): Promise<unknown> => {
    this.logger.debug(query);
    let command: string;

    // const username = `${query.from.username}`;
    const chatId = query.message.chat.id;

    // function to check if query.data is a json type
    function isJSON(str: string) {
      try {
        JSON.parse(str);
        return true;
      } catch (e) {
        console.log(e);
        return false;
      }
    }

    if (isJSON(query.data)) {
      command = JSON.parse(query.data).command;
    } else {
      command = query.data;
    }

    try {
      console.log(command);

      switch (command) {
        case '/menu':
          try {
            await this.bot.sendChatAction(chatId, 'typing');
            return await this.defaultMenu(chatId);
          } catch (error) {
            console.log(error);
            return;
          }

        case '/close':
          await this.bot.sendChatAction(query.message.chat.id, 'typing');
          return await this.bot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        default:
          return await this.bot.sendMessage(
            chatId,
            'There was an error processing your message',
          );
      }
    } catch (error) {
      console.log(error);
      return await this.bot.sendMessage(
        chatId,
        'There was an error processing your message',
      );
    }
  };

  alertNewAccount = async (account: AccountDocument): Promise<any> => {
    try {
      const newAccount = await accountMarkUp(account);

      const channelId = process.env.CHANNEL_ID;
      // Send message to the channel
      await this.bot.sendMessage(channelId, newAccount.message, {
        parse_mode: 'HTML',
      });
    } catch {
      return;
    }
  };

  defaultMenu = async (chatId: number) => {
    try {
      const menu = await menuMarkup();
      const replyMarkup = {
        inline_keyboard: menu.keyboard,
      };
      return await this.bot.sendMessage(chatId, menu.message, {
        reply_markup: replyMarkup,
      });

      return;
    } catch (error) {
      console.log(error);
    }
  };
}
