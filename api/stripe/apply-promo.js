const Stripe = require('stripe');
const { sql, initDB } = require('../../lib/db');
const { getUserFromToken, verifyToken } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

  try {
    await initDB();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { token, promoCode } = req.body;

    if (!token || !promoCode) {
      return res.status(400).json({ success: false, message: 'コードを入力してください' });
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

    // VIPユーザーはコード適用不要
    if (license.plan === 'vip') {
      return res.status(400).json({ success: false, message: '現在のプランではコード適用は不要です' });
    }

    // Stripeでプロモーションコードを検索
    const promoCodes = await stripe.promotionCodes.list({
      code: promoCode.toUpperCase(),
      active: true,
      limit: 1
    });

    if (promoCodes.data.length === 0) {
      return res.status(400).json({ success: false, message: '無効なコードです' });
    }

    const promo = promoCodes.data[0];
    const coupon = promo.coupon;

    // サブスクリプションがあるか確認
    if (!license.stripe_sub) {
      // まだサブスク開始前（トライアル中）→ プロモコード保存 + プラン即時変更
      let newPlan = 'standard';
      if (coupon.percent_off === 100) {
        newPlan = 'vip';
      } else if (coupon.amount_off > 0 || coupon.percent_off > 0) {
        newPlan = 'friends';
      }

      await sql`UPDATE licenses SET promo_code = ${promoCode.toUpperCase()}, plan = ${newPlan} WHERE id = ${license.id}`;

      let discountMsg = '';
      if (coupon.percent_off === 100) {
        discountMsg = '無料';
      } else if (coupon.amount_off) {
        discountMsg = '¥' + coupon.amount_off + '引き';
      } else if (coupon.percent_off) {
        discountMsg = coupon.percent_off + '%引き';
      }

      let planLabel = 'スタンダード';
      if (newPlan === 'vip') planLabel = 'VIP（無料）';
      else if (newPlan === 'friends') planLabel = 'FRIENDS';

      return res.status(200).json({
        success: true,
        message: 'コードが適用されました！プラン: ' + planLabel + '（サブスク開始時に' + discountMsg + 'が適用されます）'
      });
    }

    // 既存サブスクにクーポンを適用
    try {
      await stripe.subscriptions.update(license.stripe_sub, {
        coupon: coupon.id
      });
    } catch (stripeErr) {
      console.error('Stripe coupon apply error:', stripeErr);
      return res.status(400).json({ success: false, message: 'クーポンの適用に失敗しました' });
    }

    // プラン名を判定して更新
    let newPlan = 'standard';
    if (coupon.percent_off === 100) {
      newPlan = 'vip';
    } else if (coupon.amount_off > 0 || coupon.percent_off > 0) {
      newPlan = 'friends';
    }

    await sql`UPDATE licenses SET plan = ${newPlan}, promo_code = ${promoCode.toUpperCase()} WHERE id = ${license.id}`;

    let planLabel = 'スタンダード';
    if (newPlan === 'vip') planLabel = 'VIP（無料）';
    else if (newPlan === 'friends') planLabel = 'FRIENDS';

    return res.status(200).json({
      success: true,
      message: 'コードが適用されました！プラン: ' + planLabel
    });

  } catch (e) {
    console.error('Apply promo error:', e);
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
  }
};
