/**
 * DBセットアップスクリプト
 * Vercel Postgres にテーブルを作成する
 *
 * 使い方:
 *   POSTGRES_URL=postgres://... node scripts/setup-db.js
 */
const { sql } = require('@vercel/postgres');

async function setup() {
  console.log('Creating tables...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('  ✓ users');

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
  console.log('  ✓ licenses');

  // インデックス
  await sql`CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_licenses_stripe_sub ON licenses(stripe_sub)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
  console.log('  ✓ indexes');

  console.log('Done!');
  process.exit(0);
}

setup().catch(e => {
  console.error('Setup failed:', e);
  process.exit(1);
});
