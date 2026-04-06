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

    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'invalid_token' });
    }

    // ライセンスからStripe Customer IDを取得
    const licResult = await sql`SELECT stripe_customer FROM licenses WHERE user_id = ${user.id} AND stripe_customer IS NOT NULL LIMIT 1`;
    if (licResult.rows.length === 0 || !licResult.rows[0].stripe_customer) {
      return res.status(404).json({ success: false, error: 'no_subscription', message: 'サブスクリプションが見つかりません' });
    }

    // Customer Portal Session作成
    const session = await stripe.billingPortal.sessions.create({
      customer: licResult.rows[0].stripe_customer,
      return_url: process.env.STRIPE_SUCCESS_URL || 'https://obi-tool.com/'
    });

    return res.status(200).json({
      success: true,
      url: session.url
    });
  } catch (e) {
    console.error('Portal error:', e);
    return res.status(500).json({ success: false, error: 'server_error', message: e.message });
  }
};
