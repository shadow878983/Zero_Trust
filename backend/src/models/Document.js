const mongoose = require('mongoose');
const { DEPARTMENTS } = require('./User');

const DOCUMENT_DEPARTMENTS = DEPARTMENTS.filter((department) => department !== 'Unassigned');
const CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Restricted'];

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    department: { type: String, enum: DOCUMENT_DEPARTMENTS, required: true },
    classification: { type: String, enum: CLASSIFICATIONS, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storagePath: { type: String, required: true, unique: true, select: false },
    mimeType: { type: String, required: true, maxlength: 120 },
    fileSize: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

documentSchema.index({ department: 1, classification: 1, createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
module.exports.DOCUMENT_DEPARTMENTS = DOCUMENT_DEPARTMENTS;
module.exports.CLASSIFICATIONS = CLASSIFICATIONS;
