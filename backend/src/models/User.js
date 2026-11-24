const mongoose = require('mongoose');

const ROLES = ['Admin', 'Faculty', 'Student', 'Department Head'];
const DEPARTMENTS = ['Unassigned', 'CSE', 'Cybersecurity', 'Mechanical', 'Management'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'Student', required: true },
    department: { type: String, enum: DEPARTMENTS, default: 'Unassigned', required: true },
    isActive: { type: Boolean, default: true, required: true },
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.DEPARTMENTS = DEPARTMENTS;
