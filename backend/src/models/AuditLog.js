const mongoose = require('mongoose');

const AUDIT_ACTIONS = ['read', 'preview', 'download', 'manage', 'upload', 'grant', 'revoke', 'login', 'logout', 'user_update'];

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
  action: { type: String, enum: AUDIT_ACTIONS, required: true },
  result: { type: String, enum: ['allow', 'deny'], required: true },
  reason: { type: String, required: true, maxlength: 240 },
  timestamp: { type: Date, default: Date.now, required: true },
  // Store policy attributes only. Never put document contents or passwords here.
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
});

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ documentId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
