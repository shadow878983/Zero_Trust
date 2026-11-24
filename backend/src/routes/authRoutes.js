const express = require('express');
const bcrypt = require('bcryptjs');
const { ipKeyGenerator } = require('express-rate-limit');
const { z } = require('zod');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/requireAuth');
const { createAuthToken, publicUser } = require('../utils/auth');

const router = express.Router();

const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(12, 'Password must be at least 12 characters').refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 bytes'
  ),
});

const loginSchema = z.strictObject({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 bytes'
  ),
});

const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 bytes'
  ),
  newPassword: z.string().min(12).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'New password must be at least 12 characters and at most 72 bytes'
  ),
});

const profileUpdateSchema = z.strictObject({
  currentPassword: z.string().min(1).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 bytes'
  ),
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(254).optional(),
}).refine((data) => data.name !== undefined || data.email !== undefined, 'Provide a new name or email');

function invalidInput(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Invalid request data',
    errors: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return invalidInput(res, parsed.error);

  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({
      name,
      email,
      passwordHash,
      // Public registration cannot assign a privileged role or department.
      role: 'Student',
      department: 'Unassigned',
    });

    const token = createAuthToken(user);
    return res.status(201).json({
      success: true,
      data: { user: publicUser(user), token },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with that email already exists' });
    }
    console.error(`Registration failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not create account' });
  }
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return invalidInput(res, parsed.error);

  try {
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
      .select('+passwordHash +tokenVersion');

    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      await AuditLog.create({
        userId: user?._id || null,
        action: 'login',
        result: 'deny',
        reason: 'invalid_credentials',
      });
      return res.status(401).json({ success: false, message: 'Email or password is incorrect' });
    }
    if (!user.isActive) {
      await AuditLog.create({
        userId: user._id,
        action: 'login',
        result: 'deny',
        reason: 'account_inactive',
      });
      return res.status(403).json({ success: false, message: 'This account is inactive' });
    }

    const token = createAuthToken(user);
    await AuditLog.create({
      userId: user._id,
      action: 'login',
      result: 'allow',
      reason: 'credentials_valid',
      metadata: { role: user.role },
    });
    // A valid login clears this client's accumulated authentication-attempt count.
    req.app.locals.authRateLimit?.resetKey(ipKeyGenerator(req.ip, 56));
    return res.status(200).json({
      success: true,
      data: { user: publicUser(user), token },
    });
  } catch (error) {
    console.error(`Login failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not sign in' });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return invalidInput(res, parsed.error);

  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const updates = {};
    if (parsed.data.name !== undefined && parsed.data.name !== user.name) updates.name = parsed.data.name;
    const nextEmail = parsed.data.email?.toLowerCase();
    if (nextEmail !== undefined && nextEmail !== user.email) updates.email = nextEmail;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No profile changes were provided' });
    }

    const previousValues = Object.fromEntries(Object.keys(updates).map((field) => [field, user[field]]));
    Object.assign(user, updates);
    await user.save();
    await AuditLog.create({
      userId: user._id,
      action: 'user_update',
      result: 'allow',
      reason: 'profile_updated',
      metadata: {
        targetUserId: user.id,
        changedFields: Object.keys(updates),
        previousValues,
        newValues: updates,
      },
    });

    return res.status(200).json({ success: true, data: { user: publicUser(user) } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with that email already exists' });
    }
    console.error(`Profile update failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not update your profile' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({ success: true, data: { user: publicUser(req.user) } });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return invalidInput(res, parsed.error);

  try {
    const user = await User.findById(req.user._id).select('+passwordHash +tokenVersion');
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return res.status(400).json({ success: false, message: 'Choose a different new password' });
    }

    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    user.tokenVersion += 1;
    await user.save();
    await AuditLog.create({
      userId: user._id,
      action: 'user_update',
      result: 'allow',
      reason: 'password_changed',
      metadata: { targetUserId: user.id, changedFields: ['password'] },
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed. Sign in again with the new password.',
    });
  } catch (error) {
    console.error(`Password change failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not change password' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    await AuditLog.create({
      userId: req.user._id,
      action: 'logout',
      result: 'allow',
      reason: 'user_signed_out',
    });
    return res.status(200).json({ success: true, message: 'Signed out on all sessions' });
  } catch (error) {
    console.error(`Logout failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not sign out' });
  }
});

module.exports = router;
