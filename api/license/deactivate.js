const { sql, initDB } = require('../../lib/db');
const { getUserFromToken } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

  try {
    await initDB();
    const { token, deviceId } = req.body;

    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'invalid_token' });
    }

    // ライセンスのデバイスをクリア（ログアウト = デバイス解除）
    const result = await sql`
      UPDATE licenses
      SET device_id = NULL, device_name = NULL
      WHERE user_id = ${user.id}
        AND (device_id = ${deviceId} OR device_id IS NULL)
      RETURNING id
    `;

    if (result.rows.length > 0) {
      return res.status(200).json({ success: true, message: 'デバイスが解除されました' });
    }

    // デバイスIDが一致しない場合（別デバイスからの解除要求）
    // セキュリティ上、本人確認済み(トークン有効)なので許可する
    await sql`UPDATE licenses SET device_id = NULL, device_name = NULL WHERE user_id = ${user.id}`;
    return res.status(200).json({ success: true, message: 'デバイスが解除されました' });

  } catch (e) {
    console.error('Deactivate error:', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
};
