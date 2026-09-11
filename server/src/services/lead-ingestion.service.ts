import { parse } from 'csv-parse/sync';
import { Types } from 'mongoose';
import { Lead, ILead, LeadStatus, LeadPriority, LEAD_STATUS_VALUES, LEAD_PRIORITY_VALUES } from '../models/Lead.model';
import { AppError } from '../utils/error.util';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DATA_ROWS = 5000;

export interface RowError {
  row: number;
  reason: string;
}

export interface CsvImportResult {
  totalRows: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: RowError[];
}

interface ParsedLeadRow {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  notes?: string;
}

const HEADER_MAP: Record<string, keyof ParsedLeadRow> = {
  firstname: 'firstName',
  lastname: 'lastName',
  email: 'email',
  phone: 'phone',
  company: 'company',
  source: 'source',
  status: 'status',
  priority: 'priority',
  notes: 'notes'
};

export class LeadIngestionService {
  /**
   * Parses an in-memory CSV buffer, validates headers, row-level data, handles duplicates,
   * enforces workspace multi-tenancy, and bulk inserts valid leads.
   */
  public static async importCsv(
    workspaceId: string,
    createdBy: string,
    buffer: Buffer
  ): Promise<CsvImportResult> {
    // 1. Safe CSV parsing using csv-parse
    let records: string[][];
    try {
      records = parse(buffer, {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: false
      });
    } catch (err: any) {
      throw new AppError(400, `Malformed CSV file: ${err.message || 'Unable to parse CSV structure.'}`);
    }

    if (!records || records.length === 0) {
      throw new AppError(400, 'CSV file contains no headers or data.');
    }

    // 2. Header row validation
    const rawHeaders = records[0];
    if (!rawHeaders || rawHeaders.length === 0 || rawHeaders.every(h => !h || h.trim().length === 0)) {
      throw new AppError(400, 'CSV file contains an empty header row.');
    }

    const trimmedHeaders = rawHeaders.map(h => (h ? h.trim() : ''));
    if (trimmedHeaders.some(h => h.length === 0)) {
      throw new AppError(400, 'CSV contains empty column header names.');
    }

    const normalizedHeaderKeys = trimmedHeaders.map(h => h.toLowerCase().replace(/[\s_-]/g, ''));
    const uniqueHeaderKeys = new Set(normalizedHeaderKeys);
    if (uniqueHeaderKeys.size !== normalizedHeaderKeys.length) {
      throw new AppError(400, 'CSV contains duplicate column headers.');
    }

    if (!normalizedHeaderKeys.includes('firstname')) {
      throw new AppError(400, "CSV must contain a 'firstName' header column.");
    }

    // 3. Row limits and emptiness checks
    const dataRows = records.slice(1);
    if (dataRows.length === 0) {
      return {
        totalRows: 0,
        imported: 0,
        duplicates: 0,
        failed: 0,
        errors: []
      };
    }

    if (dataRows.length > MAX_DATA_ROWS) {
      throw new AppError(400, `CSV exceeds maximum allowed limit of ${MAX_DATA_ROWS} data rows.`);
    }

    // 4. Map column indices to supported Lead fields
    const columnMapping: (keyof ParsedLeadRow | null)[] = normalizedHeaderKeys.map(headerKey => {
      return HEADER_MAP[headerKey] || null;
    });

    const errors: RowError[] = [];
    const seenEmailsInCsv = new Set<string>();
    const candidateRows: { rowNum: number; data: ParsedLeadRow }[] = [];
    let duplicates = 0;
    let failed = 0;

    // 5. Row-by-row validation & normalization
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // Row 1 is header, data rows start at row 2

      const rowObj: Partial<Record<keyof ParsedLeadRow, string>> = {};
      for (let c = 0; c < columnMapping.length; c++) {
        const fieldKey = columnMapping[c];
        if (fieldKey && c < row.length) {
          rowObj[fieldKey] = row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : '';
        }
      }

      // 5.1 Required firstName validation
      const firstName = rowObj.firstName ? rowObj.firstName.trim() : '';
      if (!firstName || firstName.length === 0) {
        failed++;
        errors.push({ row: rowNum, reason: 'First name is required.' });
        continue;
      }
      if (firstName.length > 100) {
        failed++;
        errors.push({ row: rowNum, reason: 'First name cannot exceed 100 characters.' });
        continue;
      }

      // 5.2 Optional email validation & normalization
      let normalizedEmail: string | undefined = undefined;
      const rawEmail = rowObj.email ? rowObj.email.trim() : '';
      if (rawEmail.length > 0) {
        if (rawEmail.length > 255) {
          failed++;
          errors.push({ row: rowNum, reason: 'Email cannot exceed 255 characters.' });
          continue;
        }
        if (!EMAIL_REGEX.test(rawEmail)) {
          failed++;
          errors.push({ row: rowNum, reason: 'Invalid email address.' });
          continue;
        }
        normalizedEmail = rawEmail.toLowerCase();
      }

      // 5.3 Optional status validation & normalization
      let normalizedStatus: LeadStatus = 'new';
      const rawStatus = rowObj.status ? rowObj.status.trim().toLowerCase() : '';
      if (rawStatus.length > 0) {
        if (!LEAD_STATUS_VALUES.includes(rawStatus as LeadStatus)) {
          failed++;
          errors.push({
            row: rowNum,
            reason: `Invalid status "${rowObj.status}". Must be one of: ${LEAD_STATUS_VALUES.join(', ')}.`
          });
          continue;
        }
        normalizedStatus = rawStatus as LeadStatus;
      }

      // 5.4 Optional priority validation & normalization
      let normalizedPriority: LeadPriority = 'medium';
      const rawPriority = rowObj.priority ? rowObj.priority.trim().toLowerCase() : '';
      if (rawPriority.length > 0) {
        if (!LEAD_PRIORITY_VALUES.includes(rawPriority as LeadPriority)) {
          failed++;
          errors.push({
            row: rowNum,
            reason: `Invalid priority "${rowObj.priority}". Must be one of: ${LEAD_PRIORITY_VALUES.join(', ')}.`
          });
          continue;
        }
        normalizedPriority = rawPriority as LeadPriority;
      }

      // 5.5 Optional source validation & normalization (default: 'csv')
      let normalizedSource = 'csv';
      const rawSource = rowObj.source ? rowObj.source.trim() : '';
      if (rawSource.length > 0) {
        if (rawSource.length > 100) {
          failed++;
          errors.push({ row: rowNum, reason: 'Source cannot exceed 100 characters.' });
          continue;
        }
        normalizedSource = rawSource;
      }

      // 5.6 Optional string fields with length limits
      const rawLastName = rowObj.lastName ? rowObj.lastName.trim() : '';
      if (rawLastName.length > 100) {
        failed++;
        errors.push({ row: rowNum, reason: 'Last name cannot exceed 100 characters.' });
        continue;
      }
      const normalizedLastName = rawLastName.length > 0 ? rawLastName : undefined;

      const rawPhone = rowObj.phone ? rowObj.phone.trim() : '';
      if (rawPhone.length > 50) {
        failed++;
        errors.push({ row: rowNum, reason: 'Phone cannot exceed 50 characters.' });
        continue;
      }
      const normalizedPhone = rawPhone.length > 0 ? rawPhone : undefined;

      const rawCompany = rowObj.company ? rowObj.company.trim() : '';
      if (rawCompany.length > 150) {
        failed++;
        errors.push({ row: rowNum, reason: 'Company cannot exceed 150 characters.' });
        continue;
      }
      const normalizedCompany = rawCompany.length > 0 ? rawCompany : undefined;

      const rawNotes = rowObj.notes ? rowObj.notes.trim() : '';
      if (rawNotes.length > 5000) {
        failed++;
        errors.push({ row: rowNum, reason: 'Notes cannot exceed 5000 characters.' });
        continue;
      }
      const normalizedNotes = rawNotes.length > 0 ? rawNotes : undefined;

      // 5.7 In-file duplicate email check
      if (normalizedEmail) {
        if (seenEmailsInCsv.has(normalizedEmail)) {
          duplicates++;
          errors.push({
            row: rowNum,
            reason: `Duplicate lead: email "${normalizedEmail}" already present in this CSV.`
          });
          continue;
        }
        seenEmailsInCsv.add(normalizedEmail);
      }

      candidateRows.push({
        rowNum,
        data: {
          firstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          phone: normalizedPhone,
          company: normalizedCompany,
          source: normalizedSource,
          status: normalizedStatus,
          priority: normalizedPriority,
          notes: normalizedNotes
        }
      });
    }

    // 6. Database duplicate check within the workspace
    const emailsToCheck = candidateRows
      .filter(r => r.data.email)
      .map(r => r.data.email as string);

    let existingEmailsInWorkspace = new Set<string>();
    if (emailsToCheck.length > 0) {
      const existingLeads = await Lead.find({
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: false,
        email: { $in: emailsToCheck }
      })
        .select('email')
        .lean();

      existingEmailsInWorkspace = new Set(
        existingLeads
          .filter(l => l.email)
          .map(l => l.email!.toLowerCase())
      );
    }

    // 7. Prepare documents for bulk insertion
    const leadsToInsert: any[] = [];
    for (const candidate of candidateRows) {
      const email = candidate.data.email;
      if (email && existingEmailsInWorkspace.has(email)) {
        duplicates++;
        errors.push({
          row: candidate.rowNum,
          reason: `Duplicate lead: email "${email}" already exists in this workspace.`
        });
      } else {
        leadsToInsert.push({
          workspaceId: new Types.ObjectId(workspaceId),
          createdBy: new Types.ObjectId(createdBy),
          firstName: candidate.data.firstName,
          lastName: candidate.data.lastName,
          email: candidate.data.email,
          phone: candidate.data.phone,
          company: candidate.data.company,
          source: candidate.data.source,
          status: candidate.data.status,
          priority: candidate.data.priority,
          notes: candidate.data.notes,
          isArchived: false
        });
      }
    }

    // 8. Bulk insert valid, non-duplicate leads into MongoDB
    if (leadsToInsert.length > 0) {
      await Lead.insertMany(leadsToInsert, { ordered: false });
    }

    // Sort errors deterministically by row number ascending
    errors.sort((a, b) => a.row - b.row);

    return {
      totalRows: dataRows.length,
      imported: leadsToInsert.length,
      duplicates,
      failed,
      errors
    };
  }
}
