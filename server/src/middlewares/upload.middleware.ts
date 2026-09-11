import multer, { MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/error.util';

const storage = multer.memoryStorage();

// 5 MB maximum file size limit
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/csv',
  'text/x-csv',
  'application/octet-stream' // Browsers / curl occasionally send octet-stream for .csv
];

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const originalName = file.originalname || '';
  const isCsvExtension = originalName.toLowerCase().endsWith('.csv');
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase());

  // Enforce .csv extension and recognized text/csv-compatible MIME type
  if (isCsvExtension && isAllowedMime) {
    cb(null, true);
  } else {
    cb(new AppError(400, 'Invalid file type. Only CSV files (.csv) are accepted.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter
}).single('file');

export const uploadCsvMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  upload(req, res, (err: any) => {
    if (err) {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            success: false,
            error: 'File size exceeds limit of 5MB.'
          });
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({
            success: false,
            error: 'Unexpected field name. The file must be uploaded under the field name "file".'
          });
          return;
        }
        res.status(400).json({
          success: false,
          error: `Upload error: ${err.message}`
        });
        return;
      }

      if (err instanceof AppError) {
        res.status(err.statusCode).json({
          success: false,
          error: err.message
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: err.message || 'File upload failed.'
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded. Please provide a CSV file in the "file" field.'
      });
      return;
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Uploaded CSV file is empty.'
      });
      return;
    }

    next();
  });
};
