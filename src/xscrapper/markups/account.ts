import { AccountDocument } from 'src/database/schemas/account.schema';

export const accountMarkUp = async (account: AccountDocument) => {
  return {
    message: `<b>🔔 New Detected Account</b>:\n\n👤 <a href="https://x.com/${account.username}">${account.username}</a>\n👥 Followers - ${account.followersCount}\n🌍 Language - ${account.language}\n☑︎ Verified - ${account.isBlueVerified}\n💬 Telegram handle - ${account.userId}\n➡️ Score - ${account.hijackScore}`,
  };
};
