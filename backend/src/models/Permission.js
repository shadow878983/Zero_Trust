const mongoose = require('mongoose');

const PERMISSION_TYPES = ['Read', 'Download', 'Manage'];

const permissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    permissionType: { type: String, enum: PERMISSION_TYPES, required: true },
    expiresAt: {
      type: Date,
      required: true,
      validate: {
        validator: (value) => value instanceof Date && value.getTime() > Date.now(),
        message: 'Grant expiry must be in the future',
      },
    },
    revoked: { type: Boolean, default: false, required: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

permissionSchema.index({ userId: 1, documentId: 1, revoked: 1, expiresAt: 1 });
permissionSchema.index({ documentId: 1, createdAt: -1 });
permissionSchema.index(
  { userId: 1, documentId: 1 },
  { unique: true, partialFilterExpression: { revoked: false } }
);

module.exports = mongoose.model('Permission', permissionSchema);
module.exports.PERMISSION_TYPES = PERMISSION_TYPES;
