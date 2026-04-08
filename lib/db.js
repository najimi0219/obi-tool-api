const { Pool } = require('pg');

// Supabase/Postgres接続
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false
});

// Node.js環境でSSL証明書エラーを回避
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * SQLクエリ実行（テンプレートリテラル対応）
 */
async function sql(strings, ...values) {
  // テンプレートリテラルをパラメータ化クエリに変換
  let query = '';
  strings.forEach((str, i) => {
    query += str;
    if (i < values.length) {
      query += `$${i + 1}`;
    }
  });
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    return result;
  } finally {
    client.release();
  }
}

/**
 * DB初期化（テーブル作成）
 */
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        stripe_customer TEXT,
        stripe_sub TEXT,
        status TEXT DEFAULT 'trial',
        plan TEXT DEFAULT 'standard',
        trial_end TIMESTAMP,
        current_period_end TIMESTAMP,
        device_id TEXT,
        device_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // promo_codeカラムを追加（既存テーブル対応）
    await client.query(`
      ALTER TABLE licenses ADD COLUMN IF NOT EXISTS promo_code TEXT
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        expires_at TIMESTAMP NOT NULL
      )
    `);
  } finally {
    client.release();
  }
}

module.exports = { sql, initDB };
