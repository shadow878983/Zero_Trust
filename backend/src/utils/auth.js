const jwt = require('jsonwebtoken');

function createAuthToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    { ver: user.tokenVersion },
    process.env.JWT_SECRET,
    { subject: user.id, expiresIn: '1h' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

module.exports = { createAuthToken, publicUser };
