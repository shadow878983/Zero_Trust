const mongoose = require('mongoose');
const User = require('../models/User');
const Document = require('../models/Document');
const Permission = require('../models/Permission');
const AuditLog = require('../models/AuditLog');

const ACTIONS = ['read', 'preview', 'download', 'manage'];
const MATCHING_GRANT_TYPES = {
  read: ['Read', 'Download', 'Manage'],
  preview: ['Download', 'Manage'],
  download: ['Download', 'Manage'],
  manage: ['Manage'],
};

async function authorizeDocumentRequest({ actor, documentId, action }) {
  if (!ACTIONS.includes(action)) {
    throw new Error(`Unsupported document action: ${action}`);
  }

  const actorId = actor?._id || actor?.id;
  const validActorId = mongoose.isValidObjectId(actorId) ? actorId : null;
  const validDocumentId = mongoose.isValidObjectId(documentId) ? documentId : null;
  let currentUser = null;
  let document = null;
  let allowed = false;
  let canPreview = false;
  let canDownload = false;
  let reason = 'user_not_found';
  let matchingGrants = [];

  if (validActorId) {
    currentUser = await User.findById(validActorId).select('role department isActive');
  }

  if (!currentUser || !currentUser.isActive) {
    reason = 'user_inactive_or_missing';
  } else if (!validDocumentId || !(document = await Document.findById(validDocumentId))) {
    reason = 'document_not_found';
  } else {
    const sameDepartment = currentUser.department === document.department;
    const isOwner = document.ownerId.equals(currentUser._id);

    if (currentUser.role === 'Admin') {
      allowed = true;
      canPreview = true;
      canDownload = true;
      reason = 'role_admin';
    } else if (isOwner) {
      allowed = true;
      canPreview = true;
      canDownload = true;
      reason = 'document_owner';
    } else {
      const grants = await Permission.find({ userId: currentUser._id, documentId: document._id })
        .sort({ createdAt: -1 })
        .lean();
      matchingGrants = grants.filter((grant) => MATCHING_GRANT_TYPES[action].includes(grant.permissionType));
      const now = Date.now();
      const activeContentGrant = grants.some((grant) =>
        ['Download', 'Manage'].includes(grant.permissionType)
        && !grant.revoked
        && grant.expiresAt.getTime() > now
      );
      const policyAllowsContent = document.classification === 'Public'
        || (document.classification === 'Internal'
          && sameDepartment
          && ['Faculty', 'Department Head'].includes(currentUser.role));
      canPreview = activeContentGrant || policyAllowsContent;
      canDownload = canPreview;
      const activeGrant = matchingGrants.find((grant) => !grant.revoked && grant.expiresAt.getTime() > now);

      if (activeGrant) {
        allowed = true;
        reason = 'active_permission_grant';
      } else if (action === 'manage' && currentUser.role === 'Department Head' && sameDepartment) {
        allowed = true;
        reason = 'department_head_same_department';
      } else if (action !== 'manage' && document.classification === 'Public') {
        allowed = true;
        reason = 'public_document';
      } else if (
        action !== 'manage'
        && document.classification === 'Internal'
        && sameDepartment
        && ['Faculty', 'Department Head'].includes(currentUser.role)
      ) {
        allowed = true;
        reason = 'internal_same_department';
      } else if (action === 'preview' && grants.some((grant) =>
        grant.permissionType === 'Read' && !grant.revoked && grant.expiresAt.getTime() > now
      )) {
        reason = 'read_permission_does_not_allow_preview';
      } else if (matchingGrants.length > 0) {
        const latestGrant = matchingGrants[0];
        reason = latestGrant.revoked ? 'permission_revoked' : 'permission_expired';
      } else if (action === 'manage') {
        reason = 'manage_requires_owner_admin_or_department_head';
      } else if (['Confidential', 'Restricted'].includes(document.classification)) {
        reason = 'explicit_grant_required';
      } else if (document.classification === 'Internal') {
        reason = sameDepartment ? 'role_not_permitted_for_internal' : 'department_mismatch';
      } else {
        reason = 'role_or_attribute_policy_denied';
      }
    }
  }

  // Fail closed if the decision cannot be written to the audit history.
  await AuditLog.create({
    userId: validActorId,
    documentId: validDocumentId,
    action,
    result: allowed ? 'allow' : 'deny',
    reason,
    metadata: {
      userRole: currentUser?.role || null,
      userDepartment: currentUser?.department || null,
      documentDepartment: document?.department || null,
      classification: document?.classification || null,
    },
  });

  return { allowed, reason, document, canPreview, canDownload };
}

module.exports = { authorizeDocumentRequest, ACTIONS };
