const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { sql, initDB } = require('../../lib/db');
const { signToken, jsonResponse, corsOptions } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

  try {
    await initDB();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'missing_fields', message: 'メールアドレスとパスワードは必須です' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'weak_password', message: 'パスワードは6文字以上で入力してください' });
    }

    // 重複チェック
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'email_exists', message: 'このメールアドレスは既に登録されています' });
    }

    // ユーザー作成
    const userId = uuidv4();
    const hashedPw = await bcrypt.hash(password, 10);
    await sql`INSERT INTO users (id, email, password) VALUES (${userId}, ${email.toLowerCase().trim()}, ${hashedPw})`;

    // トライアルライセンス作成（30日）
    const licenseId = uuidv4();
    const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await sql`INSERT INTO licenses (id, user_id, status, plan, trial_end) VALUES (${licenseId}, ${userId}, 'trial', 'standard', ${trialEnd.toISOString()})`;

    // トークン発行
    const token = signToken(userId);

    return res.status(201).json({
      success: true,
      token,
      license: {
        status: 'trial',
        plan: 'standard',
        trialEnd: trialEnd.toISOString(),
        currentPeriodEnd: null
      }
    });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ success: false, error: 'server_error', message: 'サーバーエラーが発生しました' });
  }
};
