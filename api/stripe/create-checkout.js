const Stripe = require('stripe');
const { sql, initDB } = require('../../lib/db');
const { getUserFromToken } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

  try {
    await initDB();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { token, promoCode } = req.body;

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

    // 既存のStripe Customerがあればそれを使う
    let customerId = license.stripe_customer;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id, licenseId: license.id }
      });
      customerId = customer.id;
      await sql`UPDATE licenses SET stripe_customer = ${customerId} WHERE id = ${license.id}`;
    }

    // Checkout Session作成
    const sessionParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID, // ¥500/月の価格ID
        quantity: 1
      }],
      subscription_data: {
        trial_period_days: 30, // 1ヶ月無料トライアル
        metadata: { userId: user.id, licenseId: license.id }
      },
      allow_promotion_codes: true, // キャンペーンコード入力欄を表示
      success_url: process.env.STRIPE_SUCCESS_URL || 'https://obi-tool.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.STRIPE_CANCEL_URL || 'https://obi-tool.com/cancel',
      metadata: { userId: user.id, licenseId: license.id }
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({
      success: true,
      url: session.url
    });
  } catch (e) {
    console.error('Checkout error:', e);
    return res.status(500).json({ success: false, error: 'server_error', message: e.message });
  }
};
