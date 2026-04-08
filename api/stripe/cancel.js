const Stripe = require('stripe');
const { sql, initDB } = require('../../lib/db');
const { getUserFromToken } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

  try {
    await initDB();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: '認証が必要です' });
    }

    // ユーザー認証
    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ success: false, message: '認証エラー' });
    }

    // ライセンス取得
    const licResult = await sql`SELECT * FROM licenses WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 1`;
    if (licResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ライセンスが見つかりません' });
    }
    const license = licResult.rows[0];

    if (license.stripe_sub) {
      // Stripeサブスクがある場合 → 期末キャンセル
      await stripe.subscriptions.update(license.stripe_sub, {
        cancel_at_period_end: true
      });
      await sql`UPDATE licenses SET status = 'canceling' WHERE id = ${license.id}`;
      return res.status(200).json({
        success: true,
        message: '解約を受け付けました。現在の期間（' +
          (license.current_period_end ? new Date(license.current_period_end).toLocaleDateString('ja-JP') : '') +
          'まで）は引き続きご利用いただけます。'
      });
    } else {
      // トライアル中（Stripeサブスクなし）→ 即時キャンセル
      await sql`UPDATE licenses SET status = 'canceled' WHERE id = ${license.id}`;
      return res.status(200).json({
        success: true,
        message: 'アカウントを解約しました。'
      });
    }

  } catch (e) {
    console.error('Cancel subscription error:', e);
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
  }
};
