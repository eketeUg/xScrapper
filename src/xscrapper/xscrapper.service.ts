import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Account, StatusTypeEnum } from 'src/database/schemas/account.schema';
import { franc } from 'franc-min';
import * as cheerio from 'cheerio';
import { BotService } from './bot.service';

type QueryType = 'Top' | 'Latest' | 'People';

interface Link {
  link: string;
  source: 'bio';
  status?: StatusTypeEnum;
  isChannelTitle?: string;
}

interface UserResult {
  rest_id: string;
  legacy?: {
    screen_name?: string;
    followers_count?: number;
    description?: string;
    entities?: {
      description?: { urls?: { expanded_url: string }[] };
      url?: { urls?: { expanded_url: string }[] };
    };
  };
  is_blue_verified?: boolean;
  __typename?: string;
}

@Injectable()
export class XscrapperService {
  private logger = new Logger(XscrapperService.name);

  readonly botToken = process.env.TELEGRAM_TOKEN;

  constructor(
    private readonly httpService: HttpService,
    private readonly botService: BotService,
    @InjectModel(Account.name) private readonly AccountModel: Model<Account>,
  ) {}

  async scrapeData(query: string, type: QueryType): Promise<any> {
    try {
      const url = `https://twitter-api47.p.rapidapi.com/v2/search?query=${query}&type=${type}`;
      const response = await this.httpService.axiosRef.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': process.env.RAPID_API_KEY,
          'x-rapidapi-host': process.env.RAPID_HOST,
        },
      });

      if (!response.data.tweets) {
        return null;
      }

      await Promise.all(
        response.data.tweets.map(async (tweet: any) => {
          // Process items within tweet content
          if (tweet.content?.items) {
            for (const item of tweet.content.items) {
              const userResult = item?.item?.itemContent?.user_results?.result;
              if (!this.isValidUser(userResult)) continue;
              const links = await this.extractLinks(userResult);
              const language = this.detectLanguage(
                userResult.legacy?.description ?? '',
              );
              if (this.isValidAccount(links, language)) {
                await this.updateUserAccount(userResult, links, language);
              }
            }
          }

          // Process tweet user
          const userResult =
            tweet.content?.itemContent?.tweet_results?.result?.core
              ?.user_results?.result;
          if (this.isValidUser(userResult)) {
            const links = await this.extractLinks(userResult);
            const language = this.detectLanguage(
              userResult.legacy?.description ?? '',
            );
            if (this.isValidAccount(links, language)) {
              await this.updateUserAccount(userResult, links, language);
            }
          }
        }),
      );

      return response.data.tweets;
    } catch (error) {
      console.error('Error scraping data:', error);
      throw error;
    }
  }

  private isValidUser(userResult: UserResult | undefined): boolean {
    return (
      userResult &&
      userResult.__typename === 'User' &&
      Number(userResult.legacy?.followers_count) >= 50000 &&
      userResult.is_blue_verified
    );
  }

  // private extractLinks(userResult: UserResult): Link[] {
  //   const legacy = userResult.legacy ?? {};
  //   const descriptionUrls = legacy?.entities?.description?.urls ?? [];
  //   const profileUrls = legacy?.entities?.url?.urls ?? [];

  //   const bioDescriptionLinks = descriptionUrls.map((urlObj) => ({
  //     link: urlObj.expanded_url,
  //     source: 'bio' as const,
  //   }));

  //   const profileLinks = profileUrls.map((urlObj) => ({
  //     link: urlObj.expanded_url,
  //     source: 'bio' as const,
  //   }));

  //   const allLinksRaw = [...bioDescriptionLinks, ...profileLinks];
  //   return Array.from(
  //     new Map(allLinksRaw.map((item) => [item.link, item])).values(),
  //   );
  // }

  private async extractLinks(userResult: UserResult): Promise<Link[]> {
    const legacy = userResult.legacy ?? {};
    const descriptionUrls = legacy?.entities?.description?.urls ?? [];
    const profileUrls = legacy?.entities?.url?.urls ?? [];

    const bioDescriptionLinks = descriptionUrls.map((urlObj) => ({
      link: urlObj.expanded_url,
      source: 'bio' as const,
    }));

    const profileLinks = profileUrls.map((urlObj) => ({
      link: urlObj.expanded_url,
      source: 'bio' as const,
    }));

    const allLinksRaw = [...bioDescriptionLinks, ...profileLinks];
    const uniqueLinks = Array.from(
      new Map(allLinksRaw.map((item) => [item.link, item])).values(),
    );

    // Process Telegram links
    const processedLinks: Link[] = [];
    for (const link of uniqueLinks) {
      if (
        link.link.startsWith('https://t.me/') ||
        link.link.startsWith('http://t.me/')
      ) {
        const username = link.link.split('t.me/')[1]?.split(/[/?#]/)[0] || '';
        if (!username) {
          processedLinks.push({ ...link, status: StatusTypeEnum.Available });
          continue;
        }

        const statusResult = await this.getTelegramHandleStatus(username);

        processedLinks.push({
          ...link,
          status: this.mapStatus(statusResult.status),
          isChannelTitle: statusResult.title || undefined,
        });
      } else {
        processedLinks.push({ ...link, status: StatusTypeEnum.Pending });
      }
    }

    return processedLinks;
  }

  // Map string from getTelegramHandleStatus to enum
  private mapStatus(status: string): StatusTypeEnum {
    switch (status) {
      case 'available':
        return StatusTypeEnum.Available;
      case 'hijacked':
        return StatusTypeEnum.Hijacked;
      case 'in-use':
        return StatusTypeEnum.InUse;
      default:
        return StatusTypeEnum.Pending;
    }
  }

  private detectLanguage(description: string): string | null {
    const allowedLanguages = ['tur', 'pes', 'por', 'eng']; // ISO 639-3 codes for Turkish, Persian, Portuguese, English
    const detectedLang = franc(description, { only: allowedLanguages });
    return detectedLang === 'und' ? null : detectedLang; // 'und' means undetermined
  }

  private isValidAccount(links: Link[], language: string | null): boolean {
    const hasTelegramLink = links.some(
      (link) =>
        link.link.startsWith('https://t.me') ||
        link.link.startsWith('http://t.me'),
    );
    const isValidLanguage =
      language && ['tur', 'pes', 'por', 'eng'].includes(language);
    return hasTelegramLink && isValidLanguage;
  }

  private async updateUserAccount(
    userResult: UserResult,
    links: Link[],
    language: string | null,
  ): Promise<void> {
    const legacy = userResult.legacy ?? {};

    // --- Helper: normalize follower score ---
    const getFollowerScore = (count: number): number => {
      if (count >= 500_000) return 1.0; // top tier
      if (count >= 200_000) return 0.8;
      if (count >= 100_000) return 0.6;
      if (count >= 50_000) return 0.3; // minimum tier
      return 0.0; // anything below 50k gets no score
    };

    // --- Helper: check link source ---
    const getLinkScore = (links: Link[]): number => {
      if (links.some((l) => l.source === 'bio')) return 1.0;
      // If you wanted pinned tweet detection, you'd check here.
      return 0.0;
    };

    // --- Helper: keyword score ---
    const getKeywordScore = (text: string): number => {
      const keywords = ['crypto', 'forex', 'stocks'];
      const lowerText = text.toLowerCase();
      if (keywords.some((k) => lowerText.includes(k))) return 1.0;
      return 0.0;
    };

    // --- Helper: language score ---
    const getLanguageScore = (lang: string | null): number => {
      const targetLangs = ['tur', 'pes', 'por', 'eng'];
      return lang && targetLangs.includes(lang) ? 1.0 : 0.0;
    };

    // --- Helper: activity score ---

    const getActivityScore = async (userId: string): Promise<number> => {
      try {
        const response = await this.httpService.axiosRef.get(
          `https://twitter-api47.p.rapidapi.com/v2/user/tweets?userId=${userId}`,
          {
            headers: {
              'Content-Type': 'application/json',
              'x-rapidapi-key': process.env.RAPID_API_KEY,
              'x-rapidapi-host': process.env.RAPID_HOST,
            },
          },
        );

        if (!response.data.tweets || !response.data.tweets.length) {
          return 0.0;
        }

        const lastTweetTimeStr =
          response.data?.tweets[0]?.content?.itemContent?.tweet_results?.result
            ?.legacy?.created_at;

        if (!lastTweetTimeStr) {
          return 0.0;
        }

        const lastTweetTime = new Date(lastTweetTimeStr);
        const now = new Date();
        const diffDays =
          (now.getTime() - lastTweetTime.getTime()) / (1000 * 60 * 60 * 24);

        // Scoring tiers based on recency
        if (diffDays <= 1) return 1.0; // within a day
        if (diffDays <= 7) return 0.8; // within a week
        if (diffDays <= 30) return 0.5; // within a months
        return 0.0; // inactive > 90 days
      } catch {
        return 0.0;
      }
    };

    // --- Helper: status score ---
    const getStatusScore = (links: Link[]): number => {
      const status = links.find((l) => l.status)?.status;
      if (status === StatusTypeEnum.Available) return 1.0;
      if (status === StatusTypeEnum.Hijacked) return 0.5;
      return 0.0; // in-use or others
    };

    // Extract factor scores
    const followerScore = getFollowerScore(legacy.followers_count ?? 0);
    const verifiedScore = userResult.is_blue_verified ? 1.0 : 0.0;
    const linkScore = getLinkScore(links);
    const keywordScore = getKeywordScore(legacy.description ?? '');
    const languageScore = getLanguageScore(language);
    const activityScore = await getActivityScore(userResult.rest_id);
    const statusScore = getStatusScore(links);

    // Apply weights & calculate final hijack score (0–100)
    const hijackScore =
      (followerScore * 0.2 +
        verifiedScore * 0.1 +
        linkScore * 0.2 +
        keywordScore * 0.2 +
        languageScore * 0.05 +
        activityScore * 0.2 +
        statusScore * 0.05) *
      100;

    // Save to DB
    const existing = await this.AccountModel.findOne({
      userId: userResult.rest_id,
    });
    const account = await this.AccountModel.findOneAndUpdate(
      { userId: userResult.rest_id },
      {
        userId: userResult.rest_id,
        username: legacy.screen_name ?? '',
        followersCount: legacy.followers_count?.toString() ?? '0',
        isBlueVerified: userResult.is_blue_verified ?? false,
        description: legacy.description ?? '',
        language: language ?? '',
        hijackScore: hijackScore,
        $set: { linkSources: links },
        lastChecked: new Date(),
      },
      { upsert: true, new: true },
    );

    if (existing) {
      console.log('Existing account updated');
    } else {
      await this.botService.alertNewAccount(account);
      console.log('New account:', account);
    }
  }

  getActivityScore = async (userId: string): Promise<number> => {
    try {
      const response = await this.httpService.axiosRef.get(
        `https://twitter-api47.p.rapidapi.com/v2/user/tweets?userId=${userId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-key': process.env.RAPID_API_KEY,
            'x-rapidapi-host': process.env.RAPID_HOST,
          },
        },
      );

      if (!response.data.tweets || !response.data.tweets.length) {
        return 0.0;
      }

      const lastTweetTimeStr =
        response.data?.tweets[0]?.content?.itemContent?.tweet_results?.result
          ?.legacy?.created_at;

      if (!lastTweetTimeStr) {
        return 0.0;
      }

      const lastTweetTime = new Date(lastTweetTimeStr);
      const now = new Date();
      const diffDays =
        (now.getTime() - lastTweetTime.getTime()) / (1000 * 60 * 60 * 24);

      // Scoring tiers based on recency
      if (diffDays <= 1) return 1.0; // within a day
      if (diffDays <= 7) return 0.8; // within a week
      if (diffDays <= 30) return 0.5; // within a months
      return 0.0; // inactive > 90 days
    } catch {
      return 0.0;
    }
  };

  // getActivityScore = async (userId: string): Promise<any> => {
  //   try {
  //     const response = await this.httpService.axiosRef.get(
  //       `https://twitter-api47.p.rapidapi.com/v2/user/tweets-and-replies?userId=${userId}`,
  //       {
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'x-rapidapi-key': process.env.RAPID_API_KEY,
  //           'x-rapidapi-host': process.env.RAPID_HOST,
  //         },
  //       },
  //     );

  //     if (!response.data.tweets) {
  //       return 0.0;
  //     }

  //     const lastActiviy = {
  //       time: response.data?.tweets[0]?.content?.itemContent?.tweet_results
  //         ?.result?.legacy?.created_at,
  //       tweet:
  //         response.data?.tweets[0]?.content?.itemContent?.tweet_results?.result
  //           ?.legacy?.full_text,
  //     };
  //     return lastActiviy;

  //     return 1.0;
  //   } catch {
  //     return 0.0;
  //   }
  // };

  // private async updateUserAccount(
  //   userResult: UserResult,
  //   links: Link[],
  //   language: string | null,
  // ): Promise<void> {
  //   const legacy = userResult.legacy ?? {};
  //   await this.AccountModel.findOneAndUpdate(
  //     { userId: userResult.rest_id },
  //     {
  //       userId: userResult.rest_id,
  //       username: legacy.screen_name ?? '',
  //       followersCount: legacy.followers_count?.toString() ?? '0',
  //       isBlueVerified: userResult.is_blue_verified ?? false,
  //       description: legacy.description ?? '',
  //       language: language ?? '',
  //       $set: { linkSources: links },
  //       lastChecked: new Date(),
  //     },
  //     { upsert: true, new: true },
  //   );
  // }

  // async getTelegramHandleStatus(username: string): Promise<any> {
  //   try {
  //     const url = `https://api.telegram.org/bot${this.botToken}/getChat?chat_id=@${username}`;
  //     const response = await this.httpService.axiosRef.get(url);

  //     console.log(response.data);

  //     if (!response.status) {
  //       return { status: 'available', reason: 'Handle not found' };
  //     }

  //     const chat = data.result;
  //     const memberCount = chat?.members_count || 0;
  //     const description = chat?.description || '';
  //     const title = chat?.title || '';

  //     // For "hijacked" detection — compare to your DB snapshot
  //     const previous = await this.getPreviousSnapshot(username);
  //     if (
  //       previous &&
  //       (previous.title !== title || previous.description !== description)
  //     ) {
  //       return { status: 'hijacked', title, description, memberCount };
  //     }

  //     return { status: 'in-use', title, description, memberCount };
  //   } catch (error) {
  //     if (error.response?.data?.description?.includes('chat not found')) {
  //       return { status: 'available', reason: 'Handle not found' };
  //     }
  //     return { status: 'error', error: error.message };
  //   }
  // }

  async getTelegramHandleStatus(username: string) {
    // 1️⃣ Try Telegram Bot API getChat
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getChat?chat_id=@${username}`;
      const { data } = await this.httpService.axiosRef.get(url);

      if (data.ok) {
        const chat = data.result;
        return {
          status: 'in-use',
          type: chat.type, // group, supergroup, channel, private
          title: chat.title || chat.username || '',
          description: chat.description || '',
        };
      }
    } catch (error) {
      // If "chat not found" → fall back to scraping
      if (!error.response?.data?.description?.includes('chat not found')) {
        return { status: 'error', error: error.message };
      }
    }

    // 2️⃣ Fall back to scraping https://t.me/<username>
    try {
      const pageUrl = `https://t.me/${username}`;
      const { data: html } = await this.httpService.axiosRef.get(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      const $ = cheerio.load(html);
      const bodyText = $('body').text().toLowerCase();
      const usernameLower = username.toLowerCase();

      console.log(bodyText);

      if (
        bodyText.includes(
          `if you have telegram, you can contact @${usernameLower} right away.`,
        )
      ) {
        return { status: 'available' };
      }
      if (
        bodyText.includes('username is not available') ||
        bodyText.includes('invite link is invalid')
      ) {
        return { status: 'available' };
      }

      if (html.includes('tgme_channel_info')) {
        return { status: 'in-use', type: 'channel' };
      }
      if (html.includes('tgme_group_info')) {
        return { status: 'in-use', type: 'group' };
      }
      if (html.includes('tgme_page_title')) {
        return { status: 'in-use', type: 'user' };
      }

      return { status: 'unknown' };
    } catch (err) {
      if (err.response?.status === 404) {
        return { status: 'available' };
      }
      return { status: 'error', error: err.message };
    }
  }

  //old
  async scrapeDetail(query: string, type: QueryType): Promise<any> {
    try {
      const url = `https://twitter-api47.p.rapidapi.com/v2/search?query=${query}&type=${type}`;
      const response = await this.httpService.axiosRef.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': process.env.RAPID_API_KEY,
          'x-rapidapi-host': process.env.RAPID_HOST,
        },
      });

      if (!response.data.tweets) {
        return null;
      }
      await Promise.all(
        response.data.tweets.map(async (tweet) => {
          if (tweet.content?.items) {
            for (const item of tweet.content.items) {
              const userResult = item?.item?.itemContent?.user_results?.result;
              if (!userResult || userResult.__typename !== 'User') continue;
              if (
                Number(userResult.legacy?.followers_count) < 50000 ||
                !userResult?.is_blue_verified
              )
                continue; //filters
              const legacy = userResult.legacy ?? {};
              const descriptionUrls = legacy?.entities?.description?.urls ?? [];
              const profileUrls = legacy?.entities?.url?.urls ?? [];

              const bioDescriptionLinks = descriptionUrls.map(
                (urlObj: any) => ({
                  link: urlObj.expanded_url,
                  source: 'bio' as const,
                }),
              );

              const profileLinks = profileUrls.map((urlObj: any) => ({
                link: urlObj.expanded_url,
                source: 'bio' as const,
              }));

              const allLinksRaw = [...bioDescriptionLinks, ...profileLinks];

              // Deduplicate based on link
              const allLinks = Array.from(
                new Map(allLinksRaw.map((item) => [item.link, item])).values(),
              );

              await this.AccountModel.findOneAndUpdate(
                {
                  userId: userResult.rest_id,
                },
                {
                  userId: userResult.rest_id,
                  username: legacy?.screen_name ?? '',
                  followersCount: legacy?.followers_count?.toString() ?? '0',
                  isBlueVerified: userResult?.is_blue_verified ?? false,
                  description: legacy?.description ?? '',
                  $set: {
                    linkSources: allLinks,
                  },
                  lastChecked: new Date(),
                },
                { upsert: true, new: true },
              );
            }
          }

          const userResult =
            tweet.content?.itemContent?.tweet_results?.result?.core
              ?.user_results?.result;

          const legacy = userResult.legacy ?? {};
          const descriptionUrls = legacy?.entities?.description?.urls ?? [];
          const profileUrls = legacy?.entities?.url?.urls ?? [];

          const bioDescriptionLinks = descriptionUrls.map((urlObj: any) => ({
            link: urlObj.expanded_url,
            source: 'bio' as const,
          }));

          if (
            Number(legacy?.followers_count) < 50000 ||
            !userResult?.is_blue_verified
          )
            return; // filtter

          const profileLinks = profileUrls.map((urlObj: any) => ({
            link: urlObj.expanded_url,
            source: 'bio' as const,
          }));

          const allLinksRaw = [...bioDescriptionLinks, ...profileLinks];

          // Deduplicate based on link
          const allLinks = Array.from(
            new Map(allLinksRaw.map((item) => [item.link, item])).values(),
          );

          await this.AccountModel.findOneAndUpdate(
            {
              userId: userResult.rest_id,
            },
            {
              userId: userResult.rest_id,
              username: legacy?.screen_name ?? '',
              followersCount: legacy?.followers_count?.toString() ?? '0',
              isBlueVerified: userResult?.is_blue_verified ?? false,
              description: legacy?.description ?? '',
              $set: {
                linkSources: allLinks,
              },
              lastChecked: new Date(),
            },
            { upsert: true, new: true },
          );
        }),
      );

      return response.data.tweets;
    } catch (error) {
      console.log(error);
    }
  }
}
