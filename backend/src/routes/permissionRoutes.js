const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const Document = require('../models/Document');
const Permission = require('../models/Permission');
const { PERMISSION_TYPES } = Permission;
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();
const grantSchema = z.strictObject({
  userId: z.string().regex(/^[a-f\d]{24}$/i),
  permissionType: z.enum(PERMISSION_TYPES),
  expiresAt: z.string().datetime({ offset: true }),
});

function serializeGrant(grant) {
  const populatedUser = grant.userId && grant.userId.name !== undefined;
  const populatedGrantor = grant.grantedBy && grant.grantedBy.name !== undefined;

  return {
    id: String(grant.id || grant._id),
    user: populatedUser
      ? {
          id: String(grant.userId._id),
          name: grant.userId.name,
          email: grant.userId.email,
          role: grant.userId.role,
          department: grant.userId.department,
        }
      : String(grant.userId || ''),
    permissionType: grant.permissionType,
    expiresAt: grant.expiresAt,
    revoked: grant.revoked,
    revokedAt: grant.revokedAt,
    grantedBy: populatedGrantor
      ? {
          id: String(grant.grantedBy._id),
          name: grant.grantedBy.name,
          email: grant.grantedBy.email,
        }
      : String(grant.grantedBy || ''),
    createdAt: grant.createdAt,
  };
}

router.use(requireAuth, requireAdmin);

router.post('/:id/share', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Document not found' });
  }

  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid grant data',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const expiresAt = new Date(parsed.data.expiresAt);
  if (expiresAt.getTime() <= Date.now()) {
    return res.status(400).json({ success: false, message: 'Grant expiry must be in the future' });
  }

  try {
    const document = await Document.findById(req.params.id).select('_id department classification');
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const targetUser = await User.findById(parsed.data.userId).select('name email role department isActive');
    if (!targetUser) {
      await AuditLog.create({
        userId: req.user._id,
        documentId: document._id,
        action: 'grant',
        result: 'deny',
        reason: 'target_user_not_found',
        metadata: { targetUserId: parsed.data.userId },
      });
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }
    if (!targetUser.isActive) {
      await AuditLog.create({
        userId: req.user._id,
        documentId: document._id,
        action: 'grant',
        result: 'deny',
        reason: 'target_user_inactive',
        metadata: { targetUserId: targetUser._id },
      });
      return res.status(409).json({ success: false, message: 'Cannot grant access to an inactive user' });
    }

    const now = new Date();
    const replaced = await Permission.updateMany(
      { userId: targetUser._id, documentId: document._id, revoked: false },
      { $set: { revoked: true, revokedAt: now } }
    );

    const grant = await Permission.create({
      userId: targetUser._id,
      documentId: document._id,
      permissionType: parsed.data.permissionType,
      expiresAt,
      revoked: false,
      grantedBy: req.user._id,
    });

    try {
      if (replaced.modifiedCount > 0) {
        await AuditLog.create({
          userId: req.user._id,
          documentId: document._id,
          action: 'revoke',
          result: 'allow',
          reason: 'replaced_by_new_grant',
          metadata: { targetUserId: targetUser._id, replacedGrantCount: replaced.modifiedCount },
        });
      }
      await AuditLog.create({
        userId: req.user._id,
        documentId: document._id,
        action: 'grant',
        result: 'allow',
        reason: 'admin_grant_created',
        metadata: {
          targetUserId: targetUser._id,
          permissionType: grant.permissionType,
          expiresAt: grant.expiresAt,
          documentDepartment: document.department,
          classification: document.classification,
        },
      });
    } catch (auditError) {
      await Permission.updateOne(
        { _id: grant._id, revoked: false },
        { $set: { revoked: true, revokedAt: new Date() } }
      );
      throw auditError;
    }

    return res.status(201).json({
      success: true,
      data: {
        grant: {
          id: grant.id,
          user: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            department: targetUser.department,
          },
          permissionType: grant.permissionType,
          expiresAt: grant.expiresAt,
          revoked: grant.revoked,
          grantedBy: req.user.id,
          createdAt: grant.createdAt,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A grant for this user and document is being updated; retry shortly' });
    }
    console.error(`Document grant failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not create document grant' });
  }
});

router.get('/:id/permissions', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Document not found' });
  }

  try {
    const exists = await Document.exists({ _id: req.params.id });
    if (!exists) return res.status(404).json({ success: false, message: 'Document not found' });

    const grants = await Permission.find({ documentId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('userId', 'name email role department')
      .populate('grantedBy', 'name email');

    return res.status(200).json({
      success: true,
      data: { grants: grants.map(serializeGrant) },
    });
  } catch (error) {
    console.error(`Document permission listing failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not load document permissions' });
  }
});

router.delete('/:id/share/:userId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.userId)) {
    return res.status(404).json({ success: false, message: 'Document grant not found' });
  }

  try {
    const document = await Document.findById(req.params.id).select('_id');
    if (!document) return res.status(404).json({ success: false, message: 'Document grant not found' });

    const now = new Date();
    const result = await Permission.updateMany(
      { documentId: document._id, userId: req.params.userId, revoked: false },
      { $set: { revoked: true, revokedAt: now } }
    );

    if (result.modifiedCount === 0) {
      await AuditLog.create({
        userId: req.user._id,
        documentId: document._id,
        action: 'revoke',
        result: 'deny',
        reason: 'active_grant_not_found',
        metadata: { targetUserId: req.params.userId },
      });
      return res.status(404).json({ success: false, message: 'Active grant not found for this user and document' });
    }

    await AuditLog.create({
      userId: req.user._id,
      documentId: document._id,
      action: 'revoke',
      result: 'allow',
      reason: 'admin_revocation',
      metadata: { targetUserId: req.params.userId, revokedGrantCount: result.modifiedCount },
    });

    return res.status(200).json({
      success: true,
      message: 'Access revoked; subsequent document requests will be checked against the updated grant',
      data: { revokedGrantCount: result.modifiedCount },
    });
  } catch (error) {
    console.error(`Document grant revocation failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not revoke document access' });
  }
});

module.exports = router;
