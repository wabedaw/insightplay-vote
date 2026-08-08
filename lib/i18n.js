/**
 * 服务端文案（报错 / 验证页 / 邮件）。前端页面的固定文案在 public/i18n.js。
 * 默认英文 —— 投票人选的语言会存在用户记录上，验证页和邮件都跟着走。
 */

const LANGS = ['en', 'zh'];
const DEFAULT_LANG = 'en';

/** 把任意输入收敛成合法语言码 */
function pickLang(raw) {
  const v = String(raw || '').toLowerCase();
  if (v.startsWith('zh')) return 'zh';
  return DEFAULT_LANG;
}

/** { en, zh } 取一种；不是对象就原样返回（方便双语共用的字段） */
function pick(value, lang) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value[lang] != null ? value[lang] : value[DEFAULT_LANG];
  }
  return value;
}

const STRINGS = {
  en: {
    /* 报错 */
    closed: 'Voting has closed. Results will be announced on {date}.',
    rateLimited: 'Too many attempts — please try again in a few minutes.',
    rateLimitedEmail: 'We just sent a link to this address. Please check your inbox (and spam), or try again later.',
    badAllocation: 'Something went wrong with your ballot. Please refresh and try again.',
    badApp: 'One of those apps is not on the list. Please refresh and try again.',
    maxPerApp: 'Each app can get at most {max} stars.',
    spendAll: 'Please assign all {budget} stars (you have assigned {sum}).',
    badName: 'Please enter a name between 1 and 40 characters.',
    badEmail: "That email address doesn't look right — please check the spelling.",
    disposableEmail: 'Disposable email addresses cannot vote. Please use a regular address.',
    noConsent: 'Please tick the consent box before submitting.',
    alreadyVoted: 'This email has already voted — one ballot per email address, and it cannot be changed.',
    commentTooLong: 'Comments are limited to {max} characters.',
    commentBadApp: 'You can only comment on apps you gave stars to.',
    mailFailed: "We couldn't send the verification email. Please try again shortly, or contact {contact}.",
    pending: "Verification email sent. Click the link in it and your vote counts.",
    counted: 'Your vote is counted. Thank you!',
    unauthorized: 'ADMIN_KEY required.',

    /* 验证页 */
    vBadTitle: 'This link is invalid or already used',
    vBadBody: 'This link does not exist, has already been used, or you voted again afterwards (a new link cancels the old one). Just vote again from the home page.',
    vDoneTitle: 'You have already voted',
    vDoneBody: 'Your ballot is counted. One vote per person — it cannot be changed 🙂',
    vExpiredTitle: 'This link has expired',
    vExpiredBody: 'Verification links are valid for 48 hours. Vote again from the home page and we will send a new one.',
    vClosedTitle: 'Voting has closed',
    vClosedBody: 'Sorry — this email arrived a moment too late. Results will be announced on {date}.',
    vStaleTitle: 'This ballot is no longer valid',
    vStaleBody: '{reason} Please vote again from the home page.',
    vOkTitle: 'You’re in!',
    vOkBody: 'Thank you, {name}. Your {budget} stars are counted. Results on {date} — the app with the most stars gets built and shipped for real.',
    vBack: 'Back to the vote',

    /* 邮件 */
    mailSubject: 'Confirm your {budget} stars · {program} vote',
    mailKicker: 'One more step',
    mailHeading: 'Confirm your vote',
    mailHi: 'Hi {name},',
    mailIntro: 'You assigned your <b>{budget} stars</b> like this:',
    mailIntroText: 'You assigned your {budget} stars like this:',
    mailAsk: 'Tap the button below to confirm — your ballot only counts after that.',
    mailCta: 'Confirm my vote →',
    mailFallback: "If the button doesn't work, copy this link into your browser:",
    mailNote1: '· The link is valid for <b>48 hours</b>; voting closes <b>{deadline}</b>',
    mailNote2: '· One vote per email address, and it cannot be changed once confirmed',
    mailNote3: "· Didn't do this? Just ignore this email — nothing will be recorded",
    mailFoot: '{org} · {program} · We use your name and email only to count votes, deleted within 30 days after the event',
    mailTextConfirm: 'Click the link below to confirm — your ballot only counts after that (valid for 48 hours):',
    mailTextDeadline: 'Voting closes: {deadline}',
    mailTextOnce: 'One vote per email address, and it cannot be changed once confirmed.',
    mailTextIgnore: 'If this was not you, just ignore this email — nothing will be recorded.',
    starsUnit: '{n} stars',
  },

  zh: {
    /* 报错 */
    closed: '投票已经截止啦，结果 {date} 公布。',
    rateLimited: '操作太频繁了，请过几分钟再试。',
    rateLimitedEmail: '这个邮箱刚收过验证信，请先查收（含垃圾箱），或稍后再试。',
    badAllocation: '投票数据不对，刷新页面重来一次。',
    badApp: '有个作品不在名单里，刷新页面再试。',
    maxPerApp: '每个作品最多 {max} 颗星。',
    spendAll: '请把 {budget} 颗星全部投完（现在投了 {sum} 颗）。',
    badName: '请填一个 1–40 个字的名字。',
    badEmail: '这个邮箱地址看起来不太对，检查一下拼写。',
    disposableEmail: '一次性邮箱不能参与投票，请用常用邮箱。',
    noConsent: '需要先勾选同意才能提交。',
    alreadyVoted: '这个邮箱已经投过票了 —— 一个邮箱一张票，而且不能改。',
    commentTooLong: '留言最多 {max} 个字。',
    commentBadApp: '只能给你投了星的作品留言。',
    mailFailed: '验证信没发出去。稍等一下再试，或联系 {contact}。',
    pending: '验证信已发出，去邮箱点一下链接，这一票就生效了。',
    counted: '投票已计入，谢谢你！',
    unauthorized: '需要 ADMIN_KEY。',

    /* 验证页 */
    vBadTitle: '链接无效或已经用过了',
    vBadBody: '这条验证链接不存在、已经用过，或者你后来又投了一次（新链接会让旧的作废）。回首页重新投一次就行。',
    vDoneTitle: '你已经投过票了',
    vDoneBody: '你这张票已经计入。一人一票，改不了啦 🙂',
    vExpiredTitle: '链接过期了',
    vExpiredBody: '验证链接只有 48 小时有效期。回首页重新投一次，我们再给你发一封。',
    vClosedTitle: '投票已经截止',
    vClosedBody: '很遗憾，这封信来晚了一步。结果会在 {date} 公布。',
    vStaleTitle: '这张票已经失效',
    vStaleBody: '{reason} 回首页重新投一次。',
    vOkTitle: '投票成功！',
    vOkBody: '谢谢你，{name}。你的 {budget} 颗星已经计入，结果 {date} 公布 —— 星数最高的作品会被做成真正上线的 Web App。',
    vBack: '回到票选主页',

    /* 邮件 */
    mailSubject: '确认你的 {budget} 颗星 · {program}票选',
    mailKicker: '还差一步',
    mailHeading: '确认你的一票',
    mailHi: '{name}，你好：',
    mailIntro: '你把 <b>{budget} 颗星</b>这样分配了：',
    mailIntroText: '你把 {budget} 颗星这样分配了：',
    mailAsk: '点下面的按钮确认，这张票才会被计入。',
    mailCta: '确认我的一票 →',
    mailFallback: '按钮点不开就复制这条链接到浏览器：',
    mailNote1: '· 链接 <b>48 小时</b>内有效；投票截止 <b>{deadline}</b>',
    mailNote2: '· 一个邮箱只能投一票，确认后不能改',
    mailNote3: '· 不是你本人操作？忽略这封信即可，不会留下任何记录',
    mailFoot: '{org} · {program} · 我们只用你的姓名和邮箱计票，活动结束 30 天内删除',
    mailTextConfirm: '点下面这个链接确认，这张票才算数（链接 48 小时内有效）：',
    mailTextDeadline: '投票截止：{deadline}',
    mailTextOnce: '一个邮箱只能投一票，确认之后不能改。',
    mailTextIgnore: '如果这不是你本人操作，忽略这封邮件就行，不会产生任何记录。',
    starsUnit: '{n} 颗',
  },
};

/** t('en', 'spendAll', {budget:10, sum:8}) */
function t(lang, key, vals) {
  const table = STRINGS[lang] || STRINGS[DEFAULT_LANG];
  let s = table[key] != null ? table[key] : (STRINGS[DEFAULT_LANG][key] || key);
  if (vals) {
    for (const k of Object.keys(vals)) s = s.split('{' + k + '}').join(String(vals[k]));
  }
  return s;
}

module.exports = { LANGS, DEFAULT_LANG, pickLang, pick, t };
