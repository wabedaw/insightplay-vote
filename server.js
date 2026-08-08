/**
 * insightPLAY × 小菜创业帮 · 公开票选站
 *
 *   浏览 → 把 10 颗星分给参赛作品（单个最多 5 颗）→ 填姓名+邮箱
 *   → 收验证信 → 点链接 → 这一张票才计入
 *   一个邮箱一张票，未验证不计票。
 *
 * 双语：默认英文，可切中文。投票人选的语言存在用户记录上，
 * 验证邮件和验证页都跟着走。文案在 lib/i18n.js / public/i18n.js。
 *
 * 启动：  node server.js            （本地：验证链接直接打印在终端）
 * 配置：  见 .env.example / README.md
 */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

/**
 * 读 .env（如果有）。没上 dotenv —— 这点活不值得多一个依赖，
 * 也不想依赖 --env-file（要 Node 20.6+，而 README 写的是 18+）。
 *
 * ⚑ 真正的环境变量优先：平台（Render / Railway）上设的值不会被
 *   仓库里残留的 .env 盖掉。文件不存在就静默跳过。
 */
(function loadDotenv() {
  const file = path.join(__dirname, '.env');
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s || s[0] === '#') continue;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const key = s.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;      // 已有的不覆盖
    let val = s.slice(eq + 1).trim();
    if (val.length > 1 && (val[0] === '"' || val[0] === "'") && val.at(-1) === val[0]) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
})();

const CONFIG = require('./config');
const store = require('./lib/store');
const mailer = require('./lib/mailer');
const { pickLang, pick, t } = require('./lib/i18n');
const {
  normalizeEmail, isValidEmail, isDisposable,
  cleanName, isValidName, cleanText,
  makeToken, newId, hashIp, safeEqual,
  createRateLimiter, escapeHtml,
} = require('./lib/security');

const PORT = Number(process.env.PORT || 4090);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const DEV_SHOW_LINK = process.env.DEV_SHOW_LINK === '1';
const REVEAL = process.env.REVEAL_RESULTS === '1' || CONFIG.revealResults === true;
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 验证链接有效期 48h
const ASSET_V = 37; // 改了 public/*.css|js 就 +1，让浏览器丢掉旧缓存

const BALLOT = {
  budget: Number(CONFIG.ballot && CONFIG.ballot.budget) || 10,
  maxPerApp: Number(CONFIG.ballot && CONFIG.ballot.maxPerApp) || 5,
};

const COMMENTS = {
  enabled: !CONFIG.comments || CONFIG.comments.enabled !== false,
  maxLength: Number(CONFIG.comments && CONFIG.comments.maxLength) || 200,
};

// 关掉 = 不发验证邮件，只校验格式，提交即计票（见 config.js 里的说明）
const REQUIRE_VERIFY = CONFIG.requireEmailVerification === true;

const APP_IDS = CONFIG.apps.map((a) => a.id);
const APP_BY_ID = new Map(CONFIG.apps.map((a) => [a.id, a]));
const DEADLINE_MS = new Date(CONFIG.event.deadline).getTime();

if (!Number.isFinite(DEADLINE_MS)) {
  console.error('[config] event.deadline 不是合法时间，请检查 config.js');
  process.exit(1);
}
// budget 必须分得出去，否则谁都投不成票
if (BALLOT.budget > BALLOT.maxPerApp * APP_IDS.length) {
  console.error(`[config] ballot 配置不成立：${APP_IDS.length} 个作品 × 每个最多 ${BALLOT.maxPerApp} 颗 < 总共 ${BALLOT.budget} 颗`);
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // 部署在 Render / Nginx 后面时才拿得到真实 IP
app.use(express.json({ limit: '16kb' }));

/* 基础安全响应头（没上 helmet，够用就好） */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

store.load();

/* ── 限流 ────────────────────────────────────────────────── */
const ipLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 12 }); // 同 IP 15 分钟 12 次
const emailLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 4 }); // 同邮箱 1 小时 4 封
const clientIp = (req) => req.ip || req.socket.remoteAddress || '';

/* ── 公共小工具 ──────────────────────────────────────────── */
const votingOpen = () => Date.now() < DEADLINE_MS;

/** 前端要的作品信息（双语字段整块给前端，由前端按当前语言取） */
const publicApp = (a) => ({
  id: a.id, no: a.no, name: a.name, nameEn: a.nameEn,
  subject: a.subject, skill: a.skill,
  tagline: a.tagline, glyph: a.glyph, logo: a.logo || '', accent: a.accent,
  demoUrl: a.demoUrl && a.demoUrl !== '#' ? a.demoUrl : '',
});

/** 截止时间的两种写法，一次算好 */
const deadlineText = {
  en: new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore',
  }).format(new Date(DEADLINE_MS)) + ' SGT',
  zh: new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Singapore',
  }).format(new Date(DEADLINE_MS)) + '（新加坡时间）',
};

/** 把 {id: n} 排成「作品 × n 颗」的列表，邮件和验证页都用 */
function allocationList(allocation) {
  return CONFIG.apps
    .filter((a) => allocation[a.id] > 0)
    .map((a) => ({ app: a, stars: allocation[a.id] }))
    .sort((x, y) => y.stars - x.stars);
}

/**
 * 校验一张选票。
 * 规则：只能投名单里的作品、每个 0..maxPerApp 颗整数、总数必须正好等于 budget。
 * 「必须投完」是刻意的 —— 每张票权重一样，汇总出来的星数才可比。
 */
function parseAllocation(raw, lang) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: t(lang, 'badAllocation') };
  }
  const out = {};
  let sum = 0;

  for (const [id, value] of Object.entries(raw)) {
    if (!APP_BY_ID.has(id)) return { error: t(lang, 'badApp') };
    if (!Number.isInteger(value) || value < 0 || value > BALLOT.maxPerApp) {
      return { error: t(lang, 'maxPerApp', { max: BALLOT.maxPerApp }) };
    }
    if (value > 0) { out[id] = value; sum += value; }
  }

  if (sum !== BALLOT.budget) {
    return { error: t(lang, 'spendAll', { budget: BALLOT.budget, sum }) };
  }
  return { allocation: out };
}

/**
 * 校验留言。只接受「投了星的作品」的留言，空的直接丢掉。
 * 留言不在站上公开，只进组织者的后台导出 —— 所以这里不做内容审核，
 * 但控制字符要清掉，长度要卡死，免得脏数据进 CSV。
 */
function parseComments(raw, allocation, lang) {
  if (!COMMENTS.enabled || raw == null) return { comments: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { comments: {} };

  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    const text = cleanText(value);
    if (!text) continue;                       // 空留言不存
    if (!allocation[id]) return { error: t(lang, 'commentBadApp') };
    if ([...text].length > COMMENTS.maxLength) {
      return { error: t(lang, 'commentTooLong', { max: COMMENTS.maxLength }) };
    }
    out[id] = text;
  }
  return { comments: out };
}

/* ════════════════════════════════════════════════════════════
   API
   ════════════════════════════════════════════════════════════ */

/** 首屏数据：活动信息 + 参赛作品 +（可选）星数。双语内容整块下发。 */
app.get('/api/state', (req, res) => {
  const { stars, totalStars, voters } = store.tally(APP_IDS);
  res.json({
    event: { ...CONFIG.event, deadlineText },
    ballot: BALLOT,
    comments: COMMENTS,
    requireEmailVerification: REQUIRE_VERIFY,
    hero: CONFIG.hero || {},
    progress: CONFIG.progress || {},
    promos: CONFIG.promos || [],
    apps: CONFIG.apps.map(publicApp),
    votingOpen: votingOpen(),
    reveal: REVEAL,
    voters,
    starsCast: totalStars,          // 全场合计；= voters × budget，不泄露单个作品
    totalStars: REVEAL ? totalStars : null,
    stars: REVEAL ? stars : null,
  });
});

/**
 * 提交选票 = 注册 + 待验证。
 * 真正计票发生在 /verify（点了邮件里的链接）。
 */
app.post('/api/vote', async (req, res) => {
  const lang = pickLang((req.body && req.body.lang) || req.get('accept-language'));
  const resultDate = pick(CONFIG.event.resultDate, lang);

  if (!votingOpen()) {
    return res.status(403).json({ error: 'closed', message: t(lang, 'closed', { date: resultDate }) });
  }

  const ip = clientIp(req);
  const ipCheck = ipLimiter(hashIp(ip));
  if (!ipCheck.ok) {
    return res.status(429).json({ error: 'rate_limited', message: t(lang, 'rateLimited'), retryAfter: ipCheck.retryAfter });
  }

  const { allocation: rawAllocation, comments: rawComments, name: rawName, email: rawEmail, consent } = req.body || {};

  const parsed = parseAllocation(rawAllocation, lang);
  if (parsed.error) return res.status(400).json({ error: 'bad_allocation', message: parsed.error });
  const allocation = parsed.allocation;

  const parsedComments = parseComments(rawComments, allocation, lang);
  if (parsedComments.error) return res.status(400).json({ error: 'bad_comment', message: parsedComments.error });
  const comments = parsedComments.comments;

  const name = cleanName(rawName);
  if (!isValidName(name)) {
    return res.status(400).json({ error: 'bad_name', message: t(lang, 'badName') });
  }
  const email = String(rawEmail || '').trim();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'bad_email', message: t(lang, 'badEmail') });
  }
  if (isDisposable(email)) {
    return res.status(400).json({ error: 'disposable_email', message: t(lang, 'disposableEmail') });
  }
  if (consent !== true) {
    return res.status(400).json({ error: 'no_consent', message: t(lang, 'noConsent') });
  }

  const emailNorm = normalizeEmail(email);
  const now = new Date().toISOString();
  let user = store.findByEmail(emailNorm);

  // ⚑ 一人一票的把关点：这个邮箱验证过 = 票已生效，不能再投也不能改。
  // 必须排在限流之前 —— 否则重复投票的人先撞上限流，看到的是「太频繁」
  // 这种莫名其妙的提示，而不是「你已经投过了」。
  if (user && user.verified) {
    return res.status(409).json({ error: 'already_voted', message: t(lang, 'alreadyVoted') });
  }

  /* ── 不要邮箱验证：提交即计票 ─────────────────────────────
     只校验了邮箱格式，没有证明地址归他所有 —— 所以「一人一票」
     在这个模式下只能挡住「同一个邮箱再投一次」，挡不住换邮箱重投。 */
  if (!REQUIRE_VERIFY) {
    const record = {
      name, email, lang,
      allocation, comments,
      verified: true,          // tally 认这个字段 = 已计票
      via: 'direct',           // 审计用：这票没走过邮箱验证
      token: null, tokenExpires: null,
      pendingAllocation: null, pendingComments: null,
      updatedAt: now, verifiedAt: now,
    };
    if (user) {
      await store.updateUser(user, record);
    } else {
      user = await store.addUser({
        id: newId(), emailNorm, createdAt: now, ipHash: hashIp(ip), resendCount: 0, ...record,
      });
    }
    return res.json({
      status: 'counted',
      message: t(lang, 'counted'),
      email,
      picks: allocationList(allocation).map((p) => ({ name: p.app.name, stars: p.stars })),
    });
  }

  /* ── 要邮箱验证：发信，点链接才计票 ─────────────────────── */
  const emailCheck = emailLimiter(emailNorm);
  if (!emailCheck.ok) {
    return res.status(429).json({ error: 'rate_limited', message: t(lang, 'rateLimitedEmail'), retryAfter: emailCheck.retryAfter });
  }

  const token = makeToken();
  const tokenExpires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  if (user) {
    // 还没验证 → 改分配 / 重发都允许，旧链接同时作废
    await store.updateUser(user, {
      name, email, lang, pendingAllocation: allocation, pendingComments: comments,
      token, tokenExpires, updatedAt: now, resendCount: (user.resendCount || 0) + 1,
    });
  } else {
    user = await store.addUser({
      id: newId(), name, email, emailNorm, lang,
      pendingAllocation: allocation, allocation: null,
      pendingComments: comments, comments: null,
      verified: false, token, tokenExpires,
      createdAt: now, updatedAt: now, verifiedAt: null,
      ipHash: hashIp(ip), resendCount: 0,
    });
  }

  const link = `${PUBLIC_BASE_URL}/verify?token=${token}`;
  const msg = mailer.verifyEmail({
    lang, name, budget: BALLOT.budget, link,
    picks: allocationList(allocation).map((p) => ({ name: p.app.name, nameEn: p.app.nameEn, stars: p.stars })),
    deadlineText: deadlineText[lang],
    org: CONFIG.event.org,
    program: pick(CONFIG.event.program, lang),
  });

  try {
    await mailer.send({ to: email, ...msg });
  } catch (err) {
    console.error('[vote] 发信失败：', err.message);
    return res.status(502).json({
      error: 'mail_failed',
      message: t(lang, 'mailFailed', { contact: CONFIG.event.contactEmail }),
    });
  }

  res.json({
    status: 'pending',
    message: t(lang, 'pending'),
    email,
    ...(DEV_SHOW_LINK ? { devLink: link } : {}), // 只在本地开发时回链接
  });
});

/* ── 验证页（点邮件链接落到这里） ───────────────────────── */
app.get('/verify', async (req, res) => {
  // 没开验证就不该有人走到这里（比如旧邮件里的链接），回首页别让人卡住
  if (!REQUIRE_VERIFY) return res.redirect(302, '/');

  const token = String(req.query.token || '');
  const user = store.findByToken(token);
  // 认得出人就用他投票时选的语言，认不出就看 ?lang= / 浏览器
  const lang = user ? pickLang(user.lang) : pickLang(req.query.lang || req.get('accept-language'));
  const resultDate = pick(CONFIG.event.resultDate, lang);
  const page = (opts) => renderVerifyPage({ lang, ...opts });

  if (!token || !user) {
    return res.status(400).send(page({ state: 'error', title: t(lang, 'vBadTitle'), body: t(lang, 'vBadBody') }));
  }

  if (user.verified) {
    return res.send(page({
      state: 'info', title: t(lang, 'vDoneTitle'), body: t(lang, 'vDoneBody'), allocation: user.allocation,
    }));
  }

  if (new Date(user.tokenExpires).getTime() < Date.now()) {
    return res.status(410).send(page({ state: 'error', title: t(lang, 'vExpiredTitle'), body: t(lang, 'vExpiredBody') }));
  }

  if (!votingOpen()) {
    return res.status(403).send(page({
      state: 'error', title: t(lang, 'vClosedTitle'), body: t(lang, 'vClosedBody', { date: resultDate }),
    }));
  }

  // 待验证期间作品名单若有变动，这里再校验一次，别把坏数据写进结果
  const recheck = parseAllocation(user.pendingAllocation || {}, lang);
  if (recheck.error) {
    return res.status(400).send(page({
      state: 'error', title: t(lang, 'vStaleTitle'), body: t(lang, 'vStaleBody', { reason: recheck.error }),
    }));
  }

  await store.updateUser(user, {
    verified: true,
    allocation: recheck.allocation,
    comments: user.pendingComments || {},
    verifiedAt: new Date().toISOString(),
    token: null, // 一次性，用完即弃
  });

  res.send(page({
    state: 'success',
    title: t(lang, 'vOkTitle'),
    body: t(lang, 'vOkBody', { name: user.name, budget: BALLOT.budget, date: resultDate }),
    allocation: recheck.allocation,
  }));
});

/* ════════════════════════════════════════════════════════════
   组织者后台 —— /admin 登录后看结果与留言
   密码就是 ADMIN_KEY。登录成功发一个 HttpOnly cookie 当会话，
   会话存在内存里（单进程，重启需重新登录，这个规模够用）。
   ════════════════════════════════════════════════════════════ */
const SESSIONS = new Map();                 // token -> 过期时间戳
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;  // 8 小时
const COOKIE_NAME = 'ipvote_admin';
// 密码爆破防线：同 IP 15 分钟最多 8 次
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function newSession(res) {
  const now = Date.now();
  for (const [tk, exp] of SESSIONS) if (exp < now) SESSIONS.delete(tk); // 顺手清过期
  const token = makeToken();
  SESSIONS.set(token, now + SESSION_TTL_MS);
  const flags = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${SESSION_TTL_MS / 1000}`];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; ${flags.join('; ')}`);
}

function validSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return false;
  const exp = SESSIONS.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { SESSIONS.delete(token); return false; }
  return true;
}

/** 认 cookie 会话，也继续认 ?key= / x-admin-key（curl 脚本不用改） */
function requireAdmin(req, res, next) {
  if (validSession(req)) return next();
  const key = req.get('x-admin-key') || req.query.key || '';
  if (ADMIN_KEY && safeEqual(key, ADMIN_KEY)) return next();
  return res.status(401).json({ error: 'unauthorized', message: t('en', 'unauthorized') });
}

app.post('/api/admin/login', (req, res) => {
  const check = loginLimiter(hashIp(clientIp(req)));
  if (!check.ok) {
    return res.status(429).json({ error: 'rate_limited', retryAfter: check.retryAfter });
  }
  // 没设 ADMIN_KEY 时后台整个关闭，别让空密码蒙进来
  if (!ADMIN_KEY) return res.status(503).json({ error: 'not_configured' });
  if (!safeEqual(String((req.body && req.body.password) || ''), ADMIN_KEY)) {
    return res.status(401).json({ error: 'bad_password' });
  }
  newSession(res);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = readCookie(req, COOKIE_NAME);
  if (token) SESSIONS.delete(token);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

/** Dashboard 一次要的全部数据 */
app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const { stars, backers, totalStars, voters } = store.tally(APP_IDS);
  const ranked = CONFIG.apps
    .map((a) => ({
      id: a.id, name: a.name, glyph: a.glyph, logo: a.logo || '', accent: a.accent,
      stars: stars[a.id],
      share: totalStars ? +((stars[a.id] / totalStars) * 100).toFixed(1) : 0,
      backers: backers[a.id],
      avgFromBackers: backers[a.id] ? +(stars[a.id] / backers[a.id]).toFixed(2) : 0,
    }))
    .sort((x, y) => y.stars - x.stars);

  const byApp = CONFIG.apps.map((a) => ({ id: a.id, name: a.name, glyph: a.glyph, logo: a.logo || '', accent: a.accent, items: [] }));
  const index = new Map(byApp.map((x) => [x.id, x]));
  let commentCount = 0;
  for (const u of store.allUsers()) {
    if (!u.verified || !u.comments) continue;
    for (const [id, text] of Object.entries(u.comments)) {
      const bucket = index.get(id);
      if (!bucket) continue;
      bucket.items.push({ from: u.name, stars: (u.allocation || {})[id] || 0, text, at: u.verifiedAt });
      commentCount++;
    }
  }
  byApp.forEach((x) => x.items.sort((p, q) => q.stars - p.stars)); // 给星多的话先看

  res.json({
    event: {
      program: CONFIG.event.program,
      deadline: CONFIG.event.deadline,
      deadlineText,
      resultDate: CONFIG.event.resultDate,
    },
    ballot: BALLOT,
    requireEmailVerification: REQUIRE_VERIFY,
    reveal: REVEAL,
    votingOpen: votingOpen(),
    totals: { voters, totalStars, comments: commentCount, ...store.stats() },
    ranked,
    comments: byApp,
  });
});

app.get('/api/admin/results', requireAdmin, (req, res) => {
  const { stars, backers, totalStars, voters } = store.tally(APP_IDS);
  const ranked = CONFIG.apps
    .map((a) => ({
      id: a.id, name: a.name,
      stars: stars[a.id],
      share: totalStars ? +((stars[a.id] / totalStars) * 100).toFixed(1) : 0,
      backers: backers[a.id],                                        // 有多少人投了它
      avgFromBackers: backers[a.id] ? +(stars[a.id] / backers[a.id]).toFixed(2) : 0, // 投它的人平均给几颗
    }))
    .sort((x, y) => y.stars - x.stars);
  res.json({
    voters, totalStars, ballot: BALLOT, ...store.stats(),
    deadline: CONFIG.event.deadline, votingOpen: votingOpen(), ranked,
  });
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const header = [
    'name', 'email', 'lang', 'counted', 'via', 'created_at', 'counted_at',
    ...CONFIG.apps.map((a) => a.name),                    // 星数，每个作品一列
    ...CONFIG.apps.map((a) => a.name + ' — comment'),     // 留言，每个作品一列
  ];
  const rows = [header.map(esc).join(',')];

  for (const u of store.allUsers()) {
    const alloc = u.allocation || u.pendingAllocation || {};
    const notes = u.comments || u.pendingComments || {};
    rows.push([
      u.name, u.email, u.lang || '', u.verified ? 'yes' : 'no',
      u.via || (u.verified ? 'email' : ''),   // direct = 没走邮箱验证；email = 点过验证链接
      u.createdAt, u.verifiedAt || '',
      ...CONFIG.apps.map((a) => alloc[a.id] || 0),
      ...CONFIG.apps.map((a) => notes[a.id] || ''),
    ].map(esc).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="insightplay-vote-export.csv"');
  res.send('﻿' + rows.join('\n')); // BOM：Excel 打开中文不乱码
});

/**
 * 按作品分组的留言，直接转给各队最方便。
 * 只出已验证的票 —— 没验证的留言不算数，跟星数一个口径。
 */
app.get('/api/admin/comments', requireAdmin, (req, res) => {
  const byApp = CONFIG.apps.map((a) => ({ id: a.id, name: a.name, comments: [] }));
  const index = new Map(byApp.map((x) => [x.id, x]));

  for (const u of store.allUsers()) {
    if (!u.verified || !u.comments) continue;
    for (const [id, text] of Object.entries(u.comments)) {
      const bucket = index.get(id);
      if (bucket) bucket.comments.push({ from: u.name, stars: (u.allocation || {})[id] || 0, text, at: u.verifiedAt });
    }
  }
  // 给的星越多，话越值得先看
  byApp.forEach((x) => x.comments.sort((p, q) => q.stars - p.stars));
  res.json({ total: byApp.reduce((n, x) => n + x.comments.length, 0), apps: byApp });
});

app.get('/api/health', (req, res) => res.json({
  ok: true,
  emailVerification: REQUIRE_VERIFY,
  mailer: REQUIRE_VERIFY ? mailer.PROVIDER : 'not used',
  votingOpen: votingOpen(),
}));

/* ── 静态资源 ────────────────────────────────────────────── */
// 生产才开长缓存，本地开发改一行样式要能立刻看到
const STATIC_MAX_AGE = process.env.NODE_ENV === 'production' ? '1h' : 0;
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: STATIC_MAX_AGE }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

/* ════════════════════════════════════════════════════════════
   验证结果页（服务端渲染，复用前端那套样式）
   ════════════════════════════════════════════════════════════ */
function renderVerifyPage({ lang, state, title, body, allocation }) {
  const icons = { success: '🎉', info: '📮', error: '⚠️' };
  const picks = allocation ? allocationList(allocation) : [];
  const accent = picks.length ? picks[0].app.accent : '#6366F1';
  const program = pick(CONFIG.event.program, lang);

  const list = picks.length
    ? '<ul class="v-picks">' + picks.map((p) =>
        `<li style="--a:${escapeHtml(p.app.accent)}">
           <span class="v-g${p.app.logo ? ' has-logo' : ''}">${p.app.logo
             ? `<img src="${escapeHtml(p.app.logo)}" alt="">`
             : escapeHtml(p.app.glyph)}</span>
           <span class="v-n"><b>${escapeHtml(p.app.name)}</b><em>${escapeHtml(p.app.nameEn || '')}</em></span>
           <span class="v-s">${'★'.repeat(p.stars)}<i>${p.stars}</i></span>
         </li>`).join('') + '</ul>'
    : '';

  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-Hans' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${escapeHtml(program)}</title>
<link rel="stylesheet" href="/styles.css?v=${ASSET_V}">
</head>
<body class="verify-body">
  <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
  <main class="v-wrap">
    <div class="v-card v-${escapeHtml(state)}" style="--a:${escapeHtml(accent)}">
      <div class="v-icon">${icons[state] || '•'}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      ${list}
      <a class="btn btn-primary" href="/">${escapeHtml(t(lang, 'vBack'))}</a>
      <div class="v-foot">${escapeHtml(CONFIG.event.org)} · ${escapeHtml(program)} · ${escapeHtml(CONFIG.event.product)}</div>
    </div>
  </main>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log('');
  console.log(`  🗳  insightPLAY 票选站已启动`);
  console.log(`     本地地址   ${PUBLIC_BASE_URL}`);
  console.log(`     邮箱验证   ${REQUIRE_VERIFY ? '开（点链接才计票）' : '关（只校验格式，提交即计票）'}`);
  if (REQUIRE_VERIFY) console.log(`     发信通道   ${mailer.PROVIDER}${mailer.PROVIDER === 'console' ? '（验证链接会打印在这个终端）' : ''}`);
  console.log(`     投票方式   ${APP_IDS.length} 个作品 · 每人 ${BALLOT.budget} 颗星 · 单个最多 ${BALLOT.maxPerApp} 颗`);
  console.log(`     语言       默认英文，可切中文`);
  console.log(`     星数公开   ${REVEAL ? '是（前端可见）' : '否（计票中保密）'}`);
  console.log(`     投票截止   ${deadlineText.zh}`);
  console.log(`     数据文件   ${store.DB_FILE}`);
  if (!ADMIN_KEY) console.log(`     ⚠️  没设 ADMIN_KEY，/api/admin/* 全部关闭`);
  console.log('');
});
