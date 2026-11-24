const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { z } = require('zod');
const Document = require('../models/Document');
const { DOCUMENT_DEPARTMENTS, CLASSIFICATIONS } = Document;
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/requireAuth');
const { authorizeDocumentRequest } = require('../services/authorizationService');

const router = express.Router();
const storageDirectory = path.resolve(__dirname, '../../storage');
const allowedFiles = {
  '.pdf': { mimeType: 'application/pdf' },
  '.txt': { mimeType: 'text/plain' },
};

fs.mkdirSync(storageDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, storageDirectory),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, parts: 5, fieldSize: 10000 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedFiles[extension]) {
      callback(new Error('unsupported_file_type'));
      return;
    }
    // Client MIME labels are untrusted and Postman may send text as application/octet-stream.
    // The file bytes are checked by validateFileContents after upload.
    callback(null, true);
  },
});

const metadataSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().default(''),
  department: z.enum(DOCUMENT_DEPARTMENTS),
  classification: z.enum(CLASSIFICATIONS),
});

function publicDocument(document) {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    department: document.department,
    classification: document.classification,
    ownerId: document.ownerId,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function recordUploadDenial(user, reason, metadata = {}) {
  await AuditLog.create({
    userId: user?._id || null,
    action: 'upload',
    result: 'deny',
    reason,
    metadata,
  });
}

async function removeUploadedFile(file) {
  if (file?.path) await fs.promises.unlink(file.path).catch(() => {});
}

async function requireAdminUploader(req, res, next) {
  if (req.user.role !== 'Admin') {
    try {
      await recordUploadDenial(req.user, 'admin_role_required', {
        userRole: req.user.role,
        userDepartment: req.user.department,
      });
    } catch (error) {
      console.error(`Upload denial audit failed: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Could not record authorization decision' });
    }
    return res.status(403).json({ success: false, message: 'Administrator role required to upload documents' });
  }
  return next();
}

function receiveFile(req, res, next) {
  upload.single('file')(req, res, async (error) => {
    if (!error) return next();

    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    const unexpectedFileField = error instanceof multer.MulterError && error.code === 'LIMIT_UNEXPECTED_FILE';
    const unsupportedFileType = error.message === 'unsupported_file_type';
    const reason = tooLarge
      ? 'file_size_limit_exceeded'
      : unexpectedFileField
        ? 'unexpected_file_field'
        : unsupportedFileType
          ? 'unsupported_file_type'
          : 'invalid_upload';
    const errorCode = error.code || reason;
    console.warn(`Document upload parser rejected request: ${errorCode}`);
    try {
      await recordUploadDenial(req.user, reason);
    } catch (auditError) {
      console.error(`Upload denial audit failed: ${auditError.message}`);
      return res.status(500).json({ success: false, message: 'Could not record authorization decision' });
    }
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      code: errorCode,
      message: tooLarge
        ? 'File exceeds the 10 MB limit'
        : unexpectedFileField
          ? 'Name the file field exactly `file` and upload only one file'
          : unsupportedFileType
            ? 'Upload must use a PDF or TXT file extension'
            : error.code === 'LIMIT_PART_COUNT'
              ? 'Too many form-data parts; send one file and four text fields'
              : error.code === 'LIMIT_FIELD_COUNT'
                ? 'Too many text fields; send only title, description, department, and classification'
                : error.code === 'LIMIT_FIELD_VALUE'
                  ? 'A text field exceeds the allowed length'
                  : 'Invalid upload; check the file field and form data',
    });
  });
}

async function validateFileContents(file) {
  if (!file || file.size < 1) return false;
  const extension = path.extname(file.filename).toLowerCase();

  if (extension === '.pdf') {
    const handle = await fs.promises.open(file.path, 'r');
    try {
      const header = Buffer.alloc(5);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      return bytesRead === 5 && header.toString('ascii') === '%PDF-';
    } finally {
      await handle.close();
    }
  }

  if (extension === '.txt') {
    const contents = await fs.promises.readFile(file.path);
    if (contents.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(contents);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function rejectUpload(req, res, file, status, message, reason) {
  await removeUploadedFile(file);
  try {
    await recordUploadDenial(req.user, reason, {
      userRole: req.user.role,
      userDepartment: req.user.department,
    });
  } catch (error) {
    console.error(`Upload denial audit failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not record authorization decision' });
  }
  return res.status(status).json({ success: false, message });
}

async function authorizedDocument(req, res, action) {
  const decision = await authorizeDocumentRequest({
    actor: req.user,
    documentId: req.params.id,
    action,
  });

  if (!decision.allowed) {
    const status = decision.reason === 'document_not_found' ? 404 : 403;
    res.status(status).json({
      success: false,
      message: status === 404 ? 'Document not found' : 'Access denied',
      reason: decision.reason,
    });
    return null;
  }

  return decision.document;
}

router.post('/', requireAuth, requireAdminUploader, receiveFile, async (req, res) => {
  const parsed = metadataSchema.safeParse(req.body);
  if (!parsed.success) {
    await removeUploadedFile(req.file);
    try {
      await recordUploadDenial(req.user, 'invalid_document_metadata', {
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    } catch (error) {
      console.error(`Upload denial audit failed: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Could not record authorization decision' });
    }
    return res.status(400).json({
      success: false,
      message: 'Invalid document metadata',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  if (!req.file) {
    return rejectUpload(req, res, null, 400, 'A file is required', 'file_required');
  }

  try {
    if (!(await validateFileContents(req.file))) {
      return rejectUpload(req, res, req.file, 400, 'File contents do not match the allowed format', 'file_content_invalid');
    }

    const document = await Document.create({
      ...parsed.data,
      ownerId: req.user._id,
      storagePath: req.file.filename,
      mimeType: allowedFiles[path.extname(req.file.filename).toLowerCase()].mimeType,
      fileSize: req.file.size,
    });

    try {
      await AuditLog.create({
        userId: req.user._id,
        documentId: document._id,
        action: 'upload',
        result: 'allow',
        reason: 'admin_upload',
        metadata: {
          department: document.department,
          classification: document.classification,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
        },
      });
    } catch (auditError) {
      await Document.deleteOne({ _id: document._id });
      await removeUploadedFile(req.file);
      throw auditError;
    }

    return res.status(201).json({ success: true, data: { document: publicDocument(document) } });
  } catch (error) {
    await removeUploadedFile(req.file);
    console.error(`Document upload failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not upload document' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const candidates = await Document.find().sort({ createdAt: -1 }).limit(100);
    const documents = [];

    for (const candidate of candidates) {
      const decision = await authorizeDocumentRequest({
        actor: req.user,
        documentId: candidate._id,
        action: 'read',
      });
      if (decision.allowed) documents.push({
        ...publicDocument(decision.document),
        canPreview: decision.canPreview,
        canDownload: decision.canDownload,
      });
    }

    return res.status(200).json({ success: true, data: { documents } });
  } catch (error) {
    console.error(`Document listing failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not load documents' });
  }
});

router.get('/:id/preview', requireAuth, async (req, res) => {
  try {
    const document = await authorizedDocument(req, res, 'preview');
    if (!document) return;

    const storedDocument = await Document.findById(document._id).select('+storagePath');
    if (!storedDocument || !storedDocument.storagePath || path.basename(storedDocument.storagePath) !== storedDocument.storagePath) {
      return res.status(404).json({ success: false, message: 'Document file not found' });
    }

    const filePath = path.resolve(storageDirectory, storedDocument.storagePath);
    if (path.dirname(filePath) !== storageDirectory) {
      return res.status(404).json({ success: false, message: 'Document file not found' });
    }
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ success: false, message: 'Document file not found' });
    }

    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': storedDocument.mimeType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        console.error(`Document preview failed: ${error.message}`);
        res.status(404).json({ success: false, message: 'Document file not found' });
      }
    });
  } catch (error) {
    console.error(`Document authorization or preview failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not preview this document' });
  }
});

router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const document = await authorizedDocument(req, res, 'download');
    if (!document) return;

    const storedDocument = await Document.findById(document._id).select('+storagePath');
    if (!storedDocument || !storedDocument.storagePath || path.basename(storedDocument.storagePath) !== storedDocument.storagePath) {
      return res.status(404).json({ success: false, message: 'Document file not found' });
    }

    const filePath = path.resolve(storageDirectory, storedDocument.storagePath);
    if (path.dirname(filePath) !== storageDirectory) {
      return res.status(404).json({ success: false, message: 'Document file not found' });
    }
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ success: false, message: 'Document file not found' });
    }

    const extension = path.extname(storedDocument.storagePath).toLowerCase();
    const downloadName = `document-${storedDocument.id}${extension}`;
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(filePath, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
      },
    }, (error) => {
      if (error && !res.headersSent) {
        console.error(`Document download failed: ${error.message}`);
        res.status(404).json({ success: false, message: 'Document file not found' });
      }
    });
  } catch (error) {
    console.error(`Document authorization or download failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not process document request' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const decision = await authorizeDocumentRequest({ actor: req.user, documentId: req.params.id, action: 'read' });
    if (!decision.allowed) {
      const status = decision.reason === 'document_not_found' ? 404 : 403;
      return res.status(status).json({
        success: false,
        message: status === 404 ? 'Document not found' : 'Access denied',
        reason: decision.reason,
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        document: {
          ...publicDocument(decision.document),
          canPreview: decision.canPreview,
          canDownload: decision.canDownload,
        },
      },
    });
  } catch (error) {
    console.error(`Document detail request failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not load document' });
  }
});

module.exports = router;
