import { WorkspaceUsage, IWorkspaceUsage } from '../../models/WorkspaceUsage.model';
import { AppError } from '../../utils/error.util';
import { Model } from 'mongoose';

export interface DailyUsageStatus {
  count: number;
  limit: number;
  remaining: number;
  date: string;
}

export interface ReservationResult {
  allowed: boolean;
  currentCount: number;
  maxLimit: number;
  date: string;
}

export class WorkspaceUsageService {
  // Configurable model reference to allow pure unit testing without external database
  private static usageModel: Model<IWorkspaceUsage> = WorkspaceUsage;

  /**
   * Sets a custom or mocked Mongoose model (for testing).
   */
  public static setModel(model: Model<IWorkspaceUsage>): void {
    this.usageModel = model;
  }

  /**
   * Resets model to the default Mongoose WorkspaceUsage model.
   */
  public static resetModel(): void {
    this.usageModel = WorkspaceUsage;
  }

  /**
   * Formats the current UTC date as YYYY-MM-DD.
   */
  public static getTodayUtcString(date: Date = new Date()): string {
    return date.toISOString().slice(0, 10);
  }

  /**
   * Resolves the maximum allowed Apify searches per workspace per day.
   * Configurable via APIFY_MAX_RUNS_PER_WORKSPACE_PER_DAY (default: 10).
   */
  public static getMaxRunsPerWorkspacePerDay(): number {
    const raw = process.env.APIFY_MAX_RUNS_PER_WORKSPACE_PER_DAY;
    const parsed = parseInt(raw || '10', 10);
    return isNaN(parsed) || parsed < 1 ? 10 : parsed;
  }

  /**
   * Atomically reserves a daily Apify discovery run for the specified workspace.
   * 
   * Concurrency & Race-condition guarantee:
   * Uses an atomic MongoDB findOneAndUpdate with the condition { apifySearchCount: { $lt: maxLimit } }.
   * If two concurrent requests arrive at count=9 (limit=10), exactly ONE matches and increments to 10;
   * the other fails the condition and receives allowed=false.
   * 
   * Fail-Safe guarantee:
   * If MongoDB is unreachable or throws an unexpected error, throws 503 AppError
   * to block unmetered external spend.
   */
  public static async reserveDailyRun(workspaceId: string): Promise<ReservationResult> {
    if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
      throw new AppError(400, 'Invalid workspace ID for usage tracking.');
    }

    const todayStr = this.getTodayUtcString();
    const maxLimit = this.getMaxRunsPerWorkspacePerDay();

    try {
      // 1. Ensure the tracking document exists for this workspace and date (idempotent upsert)
      await this.usageModel.updateOne(
        { workspaceId, date: todayStr },
        { $setOnInsert: { apifySearchCount: 0 } },
        { upsert: true }
      );

      // 2. Atomically increment only if current count is strictly less than maxLimit
      const updated = await this.usageModel.findOneAndUpdate(
        {
          workspaceId,
          date: todayStr,
          apifySearchCount: { $lt: maxLimit }
        },
        {
          $inc: { apifySearchCount: 1 },
          $set: { lastApifySearchAt: new Date() }
        },
        { new: true }
      );

      if (!updated) {
        // Quota exhausted for today
        const existing = await this.usageModel.findOne({ workspaceId, date: todayStr }).lean();
        const currentCount = existing?.apifySearchCount ?? maxLimit;
        return {
          allowed: false,
          currentCount,
          maxLimit,
          date: todayStr
        };
      }

      return {
        allowed: true,
        currentCount: updated.apifySearchCount,
        maxLimit,
        date: todayStr
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      console.error('[WorkspaceUsageService] Failed to reserve daily run:', err);
      // Fail-safe: do not allow unbounded Apify calls if database tracking fails
      throw new AppError(
        503,
        'Workspace usage tracking is temporarily unavailable. Search blocked for cost protection.',
        'USAGE_TRACKING_UNAVAILABLE'
      );
    }
  }

  /**
   * Atomically refunds a daily Apify discovery run (e.g. after transient network/timeout failure).
   * Ensures the count never drops below 0 via { apifySearchCount: { $gt: 0 } }.
   */
  public static async refundDailyRun(workspaceId: string, date?: string): Promise<boolean> {
    if (!workspaceId) return false;

    const targetDate = date || this.getTodayUtcString();

    try {
      const updated = await this.usageModel.findOneAndUpdate(
        {
          workspaceId,
          date: targetDate,
          apifySearchCount: { $gt: 0 }
        },
        {
          $inc: { apifySearchCount: -1 }
        },
        { new: true }
      );

      return Boolean(updated);
    } catch (err) {
      console.error('[WorkspaceUsageService] Failed to refund daily run:', err);
      return false;
    }
  }

  /**
   * Retrieves the current day's usage statistics for a workspace.
   */
  public static async getDailyUsage(workspaceId: string, date?: string): Promise<DailyUsageStatus> {
    const targetDate = date || this.getTodayUtcString();
    const limit = this.getMaxRunsPerWorkspacePerDay();

    try {
      const doc = await this.usageModel.findOne({ workspaceId, date: targetDate }).lean();
      const count = doc?.apifySearchCount ?? 0;
      return {
        count,
        limit,
        remaining: Math.max(0, limit - count),
        date: targetDate
      };
    } catch (err) {
      console.error('[WorkspaceUsageService] Failed to query daily usage:', err);
      return {
        count: 0,
        limit,
        remaining: limit,
        date: targetDate
      };
    }
  }
}
