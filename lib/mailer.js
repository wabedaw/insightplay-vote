/**
 * 发信层 —— 三种通道，按环境变量自动选：
 *   1. RESEND_API_KEY   → Resend HTTP API（零依赖，推荐；免费额度够这类活动）
 *   2. SMTP_HOST        → nodemailer（Gmail / 企业邮箱 / 任意 SMTP）
 *   3. 都没配           → console：验证链接直接打印在终端（本地开发用）
 * 也可以用 MAIL_PROVIDER=resend|smtp|console 强制指定。
 *
 * 邮件按投票人当时选的语言发（en / zh），文案在 lib/i18n.js。
 */
const { escapeHtml } = require('./security');
const { t } = require('./i18n');

const FROM = process.env.MAIL_FROM || 'insightPLAY Vote <onboarding@resend.dev>';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const SMTP_HOST = process.env.SMTP_HOST || '';

function detectProvider() {
  const forced = (process.env.MAIL_PROVIDER || '').toLowerCase();
  if (forced) return forced;
  if (RESEND_KEY) return 'resend';
  if (SMTP_HOST) return 'smtp';
  return 'console';
}
const PROVIDER = detectProvider();

/* ── 通道实现 ────────────────────────────────────────────── */
async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

let transporter = null;
async function sendViaSmtp(msg) {
  if (!transporter) {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (_) {
      throw new Error('要用 SMTP 得先装 nodemailer：npm i nodemailer');
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '') === '1' || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  await transporter.sendMail({ from: FROM, ...msg });
}

function sendViaConsole({ to, subject, text }) {
  console.log('\n' + '─'.repeat(64));
  console.log('[mailer:console] 没配发信服务，邮件内容直接打在这里');
  console.log('收件人：', to);
  console.log('主题　：', subject);
  console.log(text);
  console.log('─'.repeat(64) + '\n');
}

async function send(msg) {
  switch (PROVIDER) {
    case 'resend': return sendViaResend(msg);
    case 'smtp': return sendViaSmtp(msg);
    default: return sendViaConsole(msg);
  }
}

/* ── 验证邮件模板 ────────────────────────────────────────── */
function verifyEmail({ lang, name, picks, budget, link, deadlineText, org, program }) {
  const L = (k, v) => t(lang, k, v);
  const subject = L('mailSubject', { budget, program });

  const text = [
    L('mailHi', { name }),
    '',
    L('mailIntroText', { budget }),
    '',
    ...picks.map((p) => `  ${'★'.repeat(p.stars)}  ${L('starsUnit', { n: p.stars })} · ${p.name}`),
    '',
    L('mailTextConfirm'),
    link,
    '',
    L('mailTextDeadline', { deadline: deadlineText }),
    L('mailTextOnce'),
    '',
    L('mailTextIgnore'),
    '',
    `— ${org} · ${program}`,
  ].join('\n');

  const picksHtml = picks.map((p) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #EEF0F4;font-size:15px;color:#1F2430;font-weight:700;">
        ${escapeHtml(p.name)}
        <span style="display:block;font-size:11.5px;color:#9AA0AE;font-weight:400;">${escapeHtml(p.nameEn || '')}</span>
      </td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid #EEF0F4;font-size:15px;color:#F59E0B;letter-spacing:1px;white-space:nowrap;">
        ${'★'.repeat(p.stars)}<span style="color:#6B7280;font-size:12.5px;margin-left:6px;">${p.stars}</span>
      </td>
    </tr>`).join('');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F4F5F9;font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 2px 14px rgba(20,24,46,.08);">
    <tr><td style="background:linear-gradient(120deg,#4F46E5,#6366F1 55%,#8B5CF6);padding:26px 30px;">
      <div style="color:#C7D2FE;font-size:11px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;">${escapeHtml(org)} · ${escapeHtml(program)}</div>
      <div style="color:#fff;font-size:23px;font-weight:800;margin-top:6px;letter-spacing:-.3px;">${escapeHtml(L('mailHeading'))}</div>
    </td></tr>
    <tr><td style="padding:28px 30px 8px;color:#1F2430;font-size:15px;line-height:1.65;">
      <p style="margin:0 0 14px;">${escapeHtml(L('mailHi', { name }))}</p>
      <p style="margin:0 0 6px;">${L('mailIntro', { budget })}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;">${picksHtml}</table>
      <p style="margin:20px 0 6px;">${escapeHtml(L('mailAsk'))}</p>
    </td></tr>
    <tr><td align="center" style="padding:14px 30px 6px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#6366F1;color:#fff;font-size:16px;font-weight:800;text-decoration:none;padding:15px 40px;border-radius:999px;">${escapeHtml(L('mailCta'))}</a>
    </td></tr>
    <tr><td style="padding:10px 30px 24px;color:#6B7280;font-size:12.5px;line-height:1.7;">
      <p style="margin:12px 0 0;">${escapeHtml(L('mailFallback'))}<br>
        <span style="word-break:break-all;color:#4F46E5;">${escapeHtml(link)}</span></p>
      <hr style="border:none;border-top:1px solid #EEF0F4;margin:18px 0;">
      <p style="margin:0 0 5px;">${L('mailNote1', { deadline: escapeHtml(deadlineText) })}</p>
      <p style="margin:0 0 5px;">${escapeHtml(L('mailNote2'))}</p>
      <p style="margin:0;">${escapeHtml(L('mailNote3'))}</p>
    </td></tr>
    <tr><td style="background:#F8F9FC;padding:16px 30px;color:#9AA0AE;font-size:11.5px;text-align:center;">
      ${escapeHtml(L('mailFoot', { org, program }))}
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

module.exports = { send, verifyEmail, PROVIDER };
