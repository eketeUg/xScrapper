import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export type AccountDocument = mongoose.HydratedDocument<Account>;

export enum LinkSourceEnum {
  Bio = 'bio',
  Tweet = 'tweet',
}

export enum StatusTypeEnum {
  Available = 'available',
  Hijacked = 'hijacked',
  InUse = 'in-use',
  Pending = 'pending',
}

export class LinkData {
  @Prop({ required: true })
  link: string;

  @Prop({ required: true, enum: LinkSourceEnum })
  source: LinkSourceEnum;

  @Prop()
  status: StatusTypeEnum;

  @Prop()
  isChannelTitle: string;
}

@Schema({ timestamps: true })
export class Account {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ unique: true, required: true })
  username: string;

  @Prop()
  followersCount: string;

  @Prop()
  language: string;

  @Prop({ default: false })
  isBlueVerified: boolean;

  @Prop()
  description: string;

  @Prop({ type: [LinkData], default: [] })
  linkSources: LinkData[];

  @Prop()
  telegramHandle: string;

  @Prop()
  hijackScore: string;

  @Prop()
  lastChecked: Date;
}

export const AccountSchema = SchemaFactory.createForClass(Account);
