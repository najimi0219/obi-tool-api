const bcrypt = require('bcryptjs');
const { sql, initDB } = require('../../lib/db');
const { signToken, jsonResponse } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

  try {
    await initDB();
    const { email, password, deviceId, deviceName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'missing_fields' });
    }

    // ===== 管理者アカウント: DB不要・デバイス制限なし・無期限 =====
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (ADMIN_EMAIL && ADMIN_PASSWORD
        && email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase()
        && password === ADMIN_PASSWORD) {
      const token = signToken('admin');
      return res.status(200).json({
        success: true,
        token,
        isAdmin: true,
        license: {
          status: 'active',
          plan: 'admin',
          trialEnd: null,
          currentPeriodEnd: null
        }
      });
    }

    // ユーザー検索
    const userResult = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase().trim()}`;
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'invalid_credentials', message: 'メールアドレスまたはパスワードが違います' });
    }
    const user = userResult.rows[0];

    // パスワード検証
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'invalid_credentials', message: 'メールアドレスまたはパスワードが違います' });
    }

    // ライセンス取得
    const licResult = await sql`SELECT * FROM licenses WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 1`;
    if (licResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'no_license', message: 'ライセンスが見つかりません' });
    }
    const license = licResult.rows[0];

    // デバイス制限チェック
    // 既に別のデバイスが登録されている場合はブロック
    if (deviceId && license.device_id && license.device_id !== deviceId) {
      return res.status(403).json({
        success: false,
        error: 'device_in_use',
        message: '別のデバイスでログイン中です。先にそのデバイスでログアウトしてください',
        currentDevice: license.device_name || '不明なデバイス'
      });
    }

    // デバイス登録/更新
    if (deviceId) {
      await sql`UPDATE licenses SET device_id = ${deviceId}, device_name = ${deviceName || 'Unknown'} WHERE id = ${license.id}`;
    }

    // トークン発行
    const token = signToken(user.id);

    return res.status(200).json({
      success: true,
      token,
      license: {
        status: license.status,
        plan: license.plan,
        trialEnd: license.trial_end ? new Date(license.trial_end).toISOString() : null,
        currentPeriodEnd: license.current_period_end ? new Date(license.current_period_end).toISOString() : null
      }
    });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ success: false, error: 'server_error', message: 'サーバーエラーが発生しました' });
  }
};
