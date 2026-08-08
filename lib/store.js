/**
 * 极简 JSON 存储：全量常驻内存 + 原子落盘（写临时文件再 rename）。
 * 票量级别在几千到几万，这种做法足够；写操作串行化，避免并发写坏文件。
 *
 * 注意：假设单进程运行。要横向扩多实例，请换 SQLite/Postgres —— 见 README。
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'votes-db.json');

const EMPTY = { version: 1, createdAt: null, users: [] };

let db = null;
/** 写队列：所有 save() 串在一条 promise 链上 */
let writeChain = Promise.resolve();

/* 二级索引，避免每次线性扫描 */
const byEmail = new Map(); // emailNorm -> user
const byToken = new Map(); // token     -> user

function indexUser(u) {
  byEmail.set(u.emailNorm, u);
  if (u.token) byToken.set(u.token, u);
}

function load() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(raw);
    if (!db || !Array.isArray(db.users)) throw new Error('bad shape');
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // 文件存在但坏了：备份一份再重建，别让活动直接停摆
      try {
        fs.copyFileSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now());
        console.error('[store] votes-db.json 解析失败，已备份并重建：', e.message);
      } catch (_) {}
    }
    db = { ...EMPTY, createdAt: new Date().toISOString() };
  }
  byEmail.clear();
  byToken.clear();
  db.users.forEach(indexUser);
  return db;
}

async function save() {
  const snapshot = JSON.stringify(db);
  writeChain = writeChain.then(async () => {
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, snapshot, 'utf8');
    await fsp.rename(tmp, DB_FILE);
  }).catch((err) => {
    console.error('[store] 写盘失败：', err);
  });
  return writeChain;
}

/* ── 查询 ────────────────────────────────────────────────── */
const findByEmail = (emailNorm) => byEmail.get(emailNorm) || null;
const findByToken = (token) => (token ? byToken.get(token) || null : null);

/* ── 写入 ────────────────────────────────────────────────── */
async function addUser(user) {
  load().users.push(user);
  indexUser(user);
  await save();
  return user;
}

/** 改用户字段；token 变了要同步索引 */
async function updateUser(user, patch) {
  if ('token' in patch && user.token) byToken.delete(user.token);
  Object.assign(user, patch);
  if (user.token) byToken.set(user.token, user);
  await save();
  return user;
}

/* ── 统计 ────────────────────────────────────────────────── */
/**
 * 只有 verified && allocation 的记录才计入。
 *  stars    —— 每个作品拿到的总星数（排名看这个）
 *  backers  —— 有多少人给这个作品投了至少 1 颗（看覆盖面）
 *  voters   —— 完成验证的投票人数
 */
function tally(appIds) {
  const stars = Object.fromEntries(appIds.map((id) => [id, 0]));
  const backers = Object.fromEntries(appIds.map((id) => [id, 0]));
  let totalStars = 0;
  let voters = 0;

  for (const u of load().users) {
    if (!u.verified || !u.allocation) continue;
    voters++;
    for (const [id, n] of Object.entries(u.allocation)) {
      if (!(id in stars) || !(n > 0)) continue;
      stars[id] += n;
      backers[id]++;
      totalStars += n;
    }
  }
  return { stars, backers, totalStars, voters };
}

function stats() {
  const users = load().users;
  return {
    registered: users.length,
    verified: users.filter((u) => u.verified).length,
    pending: users.filter((u) => !u.verified).length,
  };
}

const allUsers = () => load().users;

module.exports = {
  DATA_DIR, DB_FILE,
  load, save, findByEmail, findByToken,
  addUser, updateUser, tally, stats, allUsers,
};
