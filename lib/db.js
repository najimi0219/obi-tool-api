const { sql } = require('@vercel/postgres');

/**
 * DB初期化（テーブル作成）
 */
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
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
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TIMESTAMP NOT NULL
    )
  `;
}

module.exports = { sql, initDB };
