/**
 * ════════════════════════════════════════════════════════════════
 *  insightPLAY × 小菜创业帮 · 公开票选站 —— 唯一需要改的文件
 * ════════════════════════════════════════════════════════════════
 *  上线当天只需要改这个文件：
 *   1) apps[] —— 参赛作品的 名称 / 一句话卖点 / 试玩链接 / 图标 / 主色
 *   2) deadline —— 投票截止时间（新加坡时区）
 *   3) ballot —— 每人几颗星、单个作品上限几颗
 *   4) revealResults —— false = 计票中不公布星数（推荐）
 *  其余逻辑（注册、邮箱验证、一人一票、防刷）不用动。
 *
 *  ⚑ 双语：凡是写成 { en: '…', zh: '…' } 的字段，两种都要填。
 *    站点默认英文，右上角可切中文。页面其余固定文案在
 *    public/i18n.js（前端）和 lib/i18n.js（邮件 / 验证页 / 报错）。
 * ════════════════════════════════════════════════════════════════
 */

module.exports = {
  /* ── 活动信息 ─────────────────────────────────────────────── */
  event: {
    org: 'InsightEDU.io',
    program: { en: "Lokotopia Student Founder's Club", zh: '小菜创业帮' },
    product: 'insightPLAY',
    season: '2026',
    // 投票截止（含时区偏移，+08:00 = 新加坡）
    deadline: '2026-08-28T18:00:00+08:00',
    // 结果公布日期（纯展示文案）
    resultDate: { en: '29 Aug 2026', zh: '2026年8月29日' },
    // 面向谁（显示在作品区标题下）
    audience: {
      en: 'Primary and Secondary school students in Singapore',
      zh: '新加坡的中小学生',
    },
    siteUrl: 'https://insightedu.io',
    playUrl: 'https://play.insightedu.io',
    contactEmail: 'hello@insightedu.io',
  },

  /* ── 首屏底图 ──────────────────────────────────────────────
   *  国庆版底图（新加坡国旗 + 虚化光斑）。图上会压一层暗色蒙版
   *  保证白字可读，所以换图时选「中间偏右比较干净」的横构图。
   *  留空 '' = 只用红色渐变，不加图。
   * ──────────────────────────────────────────────────────── */
  hero: {
    image: '/hero/singapore-national-day.jpg',
  },

  /* ── 投票规则 ──────────────────────────────────────────────
   *  每人 budget 颗星，单个作品最多 maxPerApp 颗，必须全部投完。
   *  10 / 5 意味着：至少要投给 2 个作品 —— 逼投票人做取舍，
   *  也让「他怎么分配」本身成为有用的信号。
   *
   *  ⚠️ 一旦开始投票就不要再改这两个数字：改了会让已投的票权重不一致。
   * ──────────────────────────────────────────────────────── */
  ballot: {
    budget: 10,
    maxPerApp: 5,
  },

  /* ── 首页的星光进度 ──────────────────────────────────────
   *  每投出 perStar 颗星就点亮一颗大星；一共 goal 颗星算「满」。
   *  因为规则是「10 颗必须投完」，总星数恒等于 投票人数 × 10 ——
   *  这一栏不会泄露「哪个作品领先」，只是把参与规模讲得更有画面感。
   *
   *  goal 只影响这一栏画几颗星，不影响计票；投超了会继续计，
   *  页面上显示「全部点亮，还在继续」。
   * ──────────────────────────────────────────────────────── */
  progress: {
    enabled: true,
    perStar: 100,   // 多少颗星点亮一颗
    goal: 2000,     // 画 goal / perStar 颗（这里是 20 颗 = 200 人）
  },

  /* ── 要不要邮箱验证 ────────────────────────────────────────
   *  false（当前）= 不发验证邮件，只校验邮箱格式，提交即计票。
   *  true          = 发验证信，点了链接才计票。
   *
   *  ⚠️ 关掉验证的代价：「一人一票」只是名义上的 —— 谁都能敲一个
   *  不存在的邮箱投票，我们无法证明地址属于他。剩下的防线只有
   *  格式校验、一次性邮箱黑名单和限流（见 README「防刷」一节）。
   *  奖励是「真上线」，若担心刷票，把这里改回 true 即可，
   *  发信通道和验证页的代码都还在。
   * ──────────────────────────────────────────────────────── */
  requireEmailVerification: false,

  /* ── 留言 ──────────────────────────────────────────────────
   *  投票人可以给「自己投了星的每个作品」留一句话。选填。
   *
   *  ⚠️ 留言不在站上公开显示 —— 只进组织者的后台导出，再转给各队。
   *  这是刻意的：作者都是孩子，公开 UGC 就要配审核和举报流程，
   *  这个规模的活动没必要背这个包袱；不公开反而更容易收到真话。
   * ──────────────────────────────────────────────────────── */
  comments: {
    enabled: true,
    maxLength: 200,
  },

  /**
   * 计票中是否公开星数。
   *  false → 只显示「计票中保密」，杜绝跟风投票
   *  true  → 每个作品显示总星数与占比条
   * 也可以用环境变量 REVEAL_RESULTS=1 临时打开。
   */
  revealResults: false,

  /* ── 投完票之后推荐去哪 ────────────────────────────────────
   *  显示在两个地方：① 投票成功弹窗里 ② 投票截止后的首页。
   *
   *  art  : 内置插画，'cards'（卡牌扇形）或 'play'（手柄）。
   *         想换成真图就写 image: '/promo/xxx.jpg'（放进 public/promo/），
   *         填了 image 就用图片，art 自动忽略。
   *  留空数组 [] = 整块不显示。
   * ──────────────────────────────────────────────────────── */
  promos: [
    {
      id: 'store',
      url: 'https://store.insightedu.io',
      label: 'store.insightedu.io',
      title: { en: 'Insight Edu Game Store', zh: 'Insight Edu 桌游店' },
      blurb: {
        en: 'Four original Singapore card games, designed and built by students — Foodie Frenzy, Class Chaos, Chope! and Last Minute!',
        zh: '四款学生原创的新加坡桌游卡牌 —— Foodie Frenzy、Class Chaos、Chope!、Last Minute!，从设计到成品都是他们自己做的。',
      },
      cta: { en: 'Card game store', zh: '卡牌游戏商店' },
      art: 'cards',
      accent: '#B3121E',
      // image: '/promo/store.jpg',
    },
    {
      id: 'play',
      url: 'https://play.insightedu.io',
      label: 'play.insightedu.io',
      title: { en: 'insightPLAY', zh: 'insightPLAY' },
      blurb: {
        en: 'Learning that feels like play — daily quests, live challenges with friends, and games made by students.',
        zh: '像玩一样学 —— 每日任务、和朋友实时对战，还有学生自己做的游戏。',
      },
      cta: { en: 'Start playing', zh: '开始玩' },
      art: 'play',
      accent: '#E02532',
      // image: '/promo/play.jpg',
    },
  ],

  /* ── 参赛作品 ──────────────────────────────────────────────
   *  id      : 稳定标识，一旦开始投票就不要再改（星是按 id 存的）
   *  name    : 作品名（双语共用）
   *  nameEn  : 卡片上的小字副标题，取各 App 自己的原话
   *  tagline : 一句话，卡片上只显示这一句 —— 越短越好
   *  logo    : 作品自己的 logo，放在 public/logos/。填了就用图，
   *            没填才回落到下面的 glyph emoji。
   *  demoUrl : 外部站点写完整 URL；打包进本站的写 /demos/xxx/
   *  accent  : 卡片主色，取自各作品 logo 的主色，但彼此要分得开
   *
   *  ⚑ 顺序是按名字排的，不代表任何排名 —— 投票页的先后天然影响得票，
   *    中立排序比「按提交顺序」更公平。
   *  ⚑ 不设 team / members —— 作者是未成年人，页面上不公开组别和姓名。
   * ──────────────────────────────────────────────────────── */
  apps: [
    {
      id: 'busy-bean',
      no: '01',
      name: 'Busy Bean',
      nameEn: 'Focus. Grow. Go.',
      subject: { en: 'Focus', zh: '专注' },
      skill: { en: 'Bilingual · Flashcards', zh: '双语 · 闪卡' },
      tagline: {
        en: 'A playful bilingual focus companion that turns study sessions, planning, flashcards and progress into a cozy bean adventure.',
        zh: '一只双语的专注小豆 —— 把专注、计划、闪卡和进度，变成一场暖呼呼的豆子冒险。',
      },
      logo: '/logos/busy-bean.svg',
      glyph: '🌱',
      accent: '#79A63D',
      demoUrl: 'https://busy-bean-focus.zoey1030.chatgpt.site',
    },
    {
      id: 'nooklearn',
      no: '02',
      name: 'NookLearn',
      nameEn: 'Small steps. Bright minds.',
      subject: { en: 'Habits', zh: '学习习惯' },
      skill: { en: 'Gamified · Focus', zh: '游戏化 · 专注' },
      tagline: {
        en: 'A cozy, gamified learning platform that helps Singapore primary and secondary school students study, stay focused, and build better learning habits.',
        zh: '一个温暖的游戏化学习平台，帮新加坡中小学生学下去、坐得住，慢慢养成更好的学习习惯。',
      },
      logo: '/logos/nooklearn.jpg',
      glyph: '🐻',
      accent: '#C2694A',
      demoUrl: 'https://nooklearn-sg-primary.denicawongwanxin.chatgpt.site/',
    },
    {
      id: 'polaris-study',
      no: '03',
      name: 'Polaris',
      nameEn: 'A Game Plan for Every Star',
      subject: { en: 'Study Hub', zh: '学习中枢' },
      skill: { en: 'Plan · Map · Revise', zh: '计划 · 导图 · 复习' },
      tagline: {
        en: 'Timer, mind maps, practice and a revision plan — a whole study space under one north star.',
        zh: '计时、导图、练习、复习计划，一整个学习空间装在一颗北极星下。',
      },
      logo: '/logos/polaris.jpg',
      glyph: '🧭',
      accent: '#2B3F8F',
      demoUrl: 'https://polaris-study.evelyn-cai-yy.chatgpt.site',
    },
    {
      id: 'sparkstudy',
      no: '04',
      name: 'SparkStudy',
      nameEn: 'Study, level up, repeat',
      subject: { en: 'Motivation', zh: '学习激励' },
      skill: { en: 'Organise · Revise', zh: '整理 · 复习' },
      tagline: {
        en: 'A fiery companion to help you with organisation and studying.',
        zh: '一团热腾腾的小火苗，帮你把东西理清楚，也陪你把书读下去。',
      },
      logo: '/logos/sparkstudy.jpg',
      glyph: '⚡',
      accent: '#E86A17',
      demoUrl: 'https://sparkstudy-demo-0808.zoey1030.chatgpt.site/',
    },
    {
      id: 'study-safari',
      no: '05',
      name: 'Study Safari',
      nameEn: 'Explore. Learn. Grow.',
      subject: { en: 'All subjects', zh: '跨科' },
      skill: { en: 'Flashcards · Focus · Pet', zh: '闪卡 · 专注 · 宠物' },
      // 这一句取自 App 自己的欢迎页原话（这个作品没有随包给简介）
      tagline: {
        en: 'Your all-in-one study companion — flashcards, focus sessions, practice tests, and a pet room that grows with you.',
        zh: '一站式的学习搭子 —— 闪卡、专注计时、模拟练习，还有一间会跟着你长大的宠物房。',
      },
      logo: '/logos/study-safari.jpg',
      glyph: '🦁',
      accent: '#3A5326',
      demoUrl: '/demos/study-safari/',
    },
  ],

};
