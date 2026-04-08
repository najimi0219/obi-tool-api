const Stripe = require('stripe');
const { sql, initDB } = require('../../lib/db');

// Vercelではbody parsingを無効にする必要がある（rawボディでStripe署名検証するため）
module.exports.config = {
  api: { bodyParser: false }
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// サブスクリプションのクーポン情報からプラン名を判定
function determinePlan(sub) {
  if (sub.discount && sub.discount.coupon) {
    const coupon = sub.discount.coupon;
    // 100%オフ = VIP（出資者向け無料）
    if (coupon.percent_off === 100) {
      return 'vip';
    }
    // 金額割引あり = FRIENDS（紹介割引）
    if (coupon.amount_off > 0 || coupon.percent_off > 0) {
      return 'friends';
    }
  }
  return 'standard';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    await initDB();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const rawBody = await buffer(req);

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // イベント処理
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const subscriptionId = session.subscription;
        if (userId && subscriptionId) {
          // サブスク情報を取得
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          // プラン判定（クーポンの割引内容で分類）
          const plan = determinePlan(sub);
          await sql`
            UPDATE licenses
            SET stripe_sub = ${subscriptionId},
                stripe_customer = ${session.customer},
                status = ${sub.status === 'trialing' ? 'trial' : 'active'},
                plan = ${plan},
                current_period_end = ${new Date(sub.current_period_end * 1000).toISOString()},
                trial_end = ${sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null}
            WHERE user_id = ${userId}
          `;
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const subId = sub.id;
        // ステータスマッピング: active, trialing, past_due, canceled, unpaid
        let status = sub.status;
        if (status === 'trialing') status = 'trial';

        // プラン判定（クーポンの割引内容で分類）
        const plan = determinePlan(sub);

        await sql`
          UPDATE licenses
          SET status = ${status},
              plan = ${plan},
              current_period_end = ${new Date(sub.current_period_end * 1000).toISOString()},
              trial_end = ${sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null}
          WHERE stripe_sub = ${subId}
        `;
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await sql`
          UPDATE licenses
          SET status = 'canceled',
              current_period_end = ${new Date(sub.current_period_end * 1000).toISOString()}
          WHERE stripe_sub = ${sub.id}
        `;
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await sql`
            UPDATE licenses
            SET status = 'past_due'
            WHERE stripe_sub = ${invoice.subscription}
          `;
        }
        break;
      }

      default:
        // 他のイベントは無視
        break;
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
