const { sql, initDB } = require('../../lib/db');
const { getUserFromToken, verifyToken } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

  try {
    await initDB();
    const { token, deviceId } = req.body;

    // ===== 管理者アカウント: 常に有効・制限なし =====
    const decoded = verifyToken(token);
    if (decoded && decoded.userId === 'admin') {
      return res.status(200).json({
        success: true,
        isAdmin: true,
        license: {
          status: 'active',
          plan: 'admin',
          trialEnd: null,
          currentPeriodEnd: null
        }
      });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'invalid_token' });
    }

    // ライセンス取得
    const licResult = await sql`SELECT * FROM licenses WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 1`;
    if (licResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'no_license' });
    }
    const license = licResult.rows[0];

    // デバイスIDチェック
    if (deviceId && license.device_id && license.device_id !== deviceId) {
      return res.status(403).json({
        success: false,
        error: 'device_mismatch',
        message: '別のデバイスで使用中です'
      });
    }

    // ステータスチェック
    const now = new Date();

    // トライアル期限
    if (license.status === 'trial' && license.trial_end) {
      if (now > new Date(license.trial_end)) {
        await sql`UPDATE licenses SET status = 'trial_expired' WHERE id = ${license.id}`;
        return res.status(200).json({
          success: true,
          license: {
            status: 'trial_expired',
            plan: license.plan,
            trialEnd: license.trial_end ? new Date(license.trial_end).toISOString() : null,
            currentPeriodEnd: null
          }
        });
      }
    }

    // サブスク期限（Stripeのwebhookで更新されるが、念のためチェック）
    if (license.status === 'active' && license.current_period_end) {
      if (now > new Date(license.current_period_end)) {
        // Stripeに問い合わせてステータスを同期すべきだが、
        // webhookで処理されるはずなのでここでは past_due にする
        await sql`UPDATE licenses SET status = 'past_due' WHERE id = ${license.id}`;
        return res.status(200).json({
          success: true,
          license: {
            status: 'past_due',
            plan: license.plan,
            trialEnd: null,
            currentPeriodEnd: license.current_period_end ? new Date(license.current_period_end).toISOString() : null
          }
        });
      }
    }

    return res.status(200).json({
      success: true,
      license: {
        status: license.status,
        plan: license.plan,
        trialEnd: license.trial_end ? new Date(license.trial_end).toISOString() : null,
        currentPeriodEnd: license.current_period_end ? new Date(license.current_period_end).toISOString() : null
      }
    });
  } catch (e) {
    console.error('Verify error:', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
};
