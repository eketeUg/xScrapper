import { AccountDocument } from 'src/database/schemas/account.schema';

export const accountMarkUp = async (account: AccountDocument) => {
  const telegramLinks = account.linkSources
    .filter(
      (link) =>
        link.link.startsWith('https://t.me') ||
        link.link.startsWith('http://t.me'),
    )
    .map(
      (link) =>
        `   ${link.link}\n  ├status: ${link.status}\n  └source: ${link.source}`,
    )
    .join('\n');

  return {
    message:
      `<b>🔔 New Detected Account</b>:\n\n` +
      `👤 <a href="https://x.com/${account.username}">${account.username}</a>\n` +
      `👥 Followers - ${account.followersCount}\n` +
      `🌍 Language - ${account.language}\n` +
      `☑︎ Verified - ${account.isBlueVerified}\n` +
      `💬 Telegram Links - \n${telegramLinks || 'N/A'}\n` +
      `➡️ Score - ${account.hijackScore}`,
  };
};
