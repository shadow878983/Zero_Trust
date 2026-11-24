const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const { ROLES, DEPARTMENTS } = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { AUDIT_ACTIONS } = AuditLog;
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { publicUser } = require('../utils/auth');

const router = express.Router();
const updateUserSchema = z.strictObject({
  role: z.enum(ROLES).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

const auditQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.enum(AUDIT_ACTIONS).optional(),
  result: z.enum(['allow', 'deny']).optional(),
  userId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  documentId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

router.use(requireAuth, requireAdmin);

router.get('/users', async (_req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json({
      success: true,
      data: { users: users.map(publicUser) },
    });
  } catch (error) {
    console.error(`Admin user list failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not load users' });
  }
});

router.get('/audit-logs', async (req, res) => {
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid audit-log filters',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { page, limit, action, result, userId, documentId, from, to } = parsed.data;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && toDate && fromDate > toDate) {
    return res.status(400).json({ success: false, message: '`from` must be earlier than or equal to `to`' });
  }

  const filter = {};
  if (action) filter.action = action;
  if (result) filter.result = result;
  if (userId) filter.userId = userId;
  if (documentId) filter.documentId = documentId;
  if (fromDate || toDate) {
    filter.timestamp = {};
    if (fromDate) filter.timestamp.$gte = fromDate;
    if (toDate) filter.timestamp.$lte = toDate;
  }

  try {
    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ timestamp: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name email role department')
        .populate('documentId', 'title department classification'),
    ]);
    const targetUserIds = [...new Set(logs
      .map((log) => String(log.metadata?.targetUserId || ''))
      .filter((id) => mongoose.isValidObjectId(id)))];
    const targetUsers = targetUserIds.length
      ? await User.find({ _id: { $in: targetUserIds } }).select('name email')
      : [];
    const targetUserById = new Map(targetUsers.map((target) => [target.id, target]));

    return res.status(200).json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: log.id,
          user: log.userId
            ? { id: String(log.userId._id || log.userId), name: log.userId.name, email: log.userId.email, role: log.userId.role, department: log.userId.department }
            : null,
          affectedUser: targetUserById.has(String(log.metadata?.targetUserId || ''))
            ? {
                id: String(log.metadata.targetUserId),
                name: targetUserById.get(String(log.metadata.targetUserId)).name,
                email: targetUserById.get(String(log.metadata.targetUserId)).email,
              }
            : null,
          document: log.documentId
            ? { id: String(log.documentId._id || log.documentId), title: log.documentId.title, department: log.documentId.department, classification: log.documentId.classification }
            : null,
          action: log.action,
          result: log.result,
          reason: log.reason,
          timestamp: log.timestamp,
          metadata: log.metadata,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error(`Audit-log query failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not load audit logs' });
  }
});

router.patch('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid request data',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updates = parsed.data;
    const demotesOrDisablesSelf = target.id === req.user.id && (
      (updates.role !== undefined && updates.role !== 'Admin') || updates.isActive === false
    );
    if (demotesOrDisablesSelf) {
      return res.status(409).json({
        success: false,
        message: 'You cannot remove your own administrator access or deactivate your account',
      });
    }

    const remainsActiveAdmin = (updates.role ?? target.role) === 'Admin'
      && (updates.isActive ?? target.isActive);
    if (target.role === 'Admin' && target.isActive && !remainsActiveAdmin) {
      const activeAdminCount = await User.countDocuments({ role: 'Admin', isActive: true });
      if (activeAdminCount <= 1) {
        return res.status(409).json({
          success: false,
          message: 'The last active administrator cannot be demoted or deactivated',
        });
      }
    }

    Object.assign(target, updates);
    await target.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'user_update',
      result: 'allow',
      reason: 'admin_user_updated',
      metadata: {
        targetUserId: target._id,
        changedFields: Object.keys(updates),
        values: updates,
      },
    });

    return res.status(200).json({
      success: true,
      data: { user: publicUser(target) },
    });
  } catch (error) {
    console.error(`Admin user update failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not update user' });
  }
});

module.exports = router;
