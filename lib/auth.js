const jwt = require('jsonwebtoken');
const { sql } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '90d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * tokenからユーザーIDを取得
 */
async function getUserFromToken(token) {
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded || !decoded.userId) return null;

  const result = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

/**
 * レスポンスヘルパー
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function corsOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

module.exports = { signToken, verifyToken, getUserFromToken, jsonResponse, corsOptions, JWT_SECRET };
