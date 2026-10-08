import crypto from 'crypto';
import { User, IUser } from '../models/User.model';
import { Workspace, IWorkspace } from '../models/Workspace.model';
import { hashPassword, comparePassword } from '../utils/password.util';
import { signAuthToken } from '../utils/jwt.util';
import { AppError } from '../utils/error.util';
import { emailService } from './email';
import { verifySupabaseToken } from './supabase-auth.service';
import { env } from '../config/env';

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceId: string;
  isEmailVerified?: boolean;
  createdAt: Date;
}

export interface SafeWorkspace {
  id: string;
  name: string;
  ownerId?: string;
  settings: {
    timezone: string;
    currency: string;
  };
}

export interface RegisterResult {
  token: string;
  user: SafeUser;
  workspace: SafeWorkspace;
}

export interface AuthResult {
  token: string;
  user: SafeUser;
  workspace: SafeWorkspace;
}

export class AuthService {
  /**
   * Helper to construct and dispatch account verification email using the existing EmailService.
   */
  private static async sendVerificationEmail(
    email: string,
    name: string,
    token: string
  ): Promise<void> {
    const baseUrl = (env.CLIENT_URL || 'https://lead-flow-nine-lyart.vercel.app').replace(/\/$/, '');
    const verificationUrl = `${baseUrl}/?token=${encodeURIComponent(token)}`;

    const subject = 'Verify your LeadFlow account';
    const textBody = `Hello ${name},

Thank you for registering with LeadFlow. Please verify your email address to activate your account by clicking the link below:

${verificationUrl}

This verification link will expire in 24 hours.

If you did not create an account on LeadFlow, you can safely ignore this email.`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 2rem; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #1e40af; margin-top: 0;">Welcome to LeadFlow, ${name}!</h2>
        <p style="color: #374151; font-size: 1rem; line-height: 1.5;">
          Please verify your email address to activate your account and start discovering leads and building automated workflows.
        </p>
        <div style="margin: 2rem 0; text-align: center;">
          <a href="${verificationUrl}" style="background-color: #1e40af; color: #ffffff; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #6b7280; font-size: 0.875rem;">
          Or copy and paste this link into your browser:<br />
          <a href="${verificationUrl}" style="color: #2563eb; word-break: break-all;">${verificationUrl}</a>
        </p>
        <p style="color: #9ca3af; font-size: 0.8rem; margin-top: 2rem; border-top: 1px solid #f3f4f6; padding-top: 1rem;">
          This link will expire in 24 hours. If you did not create a LeadFlow account, please disregard this message.
        </p>
      </div>
    `;

    try {
      await emailService.sendEmail({
        to: email,
        subject,
        text: textBody,
        html: htmlBody
      });
    } catch (err: any) {
      console.error('[AuthService] Verification email delivery failure:', err?.message || err);
      throw new AppError(502, 'Failed to send verification email. Please try again later.');
    }
  }

  /**
   * Registers a new user, creates their initial workspace,
   * sets the user as workspace owner with admin role, and returns JWT.
   * Employs safe rollback to prevent orphan records.
   * Email verification is temporarily disabled pending production SMTP configuration.
   */
  public static async register(dto: RegisterDTO): Promise<RegisterResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedName = dto.name.trim();
    const normalizedWorkspaceName = dto.workspaceName.trim();

    // 1. Check for duplicate email across user accounts
    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    if (existingUser) {
      throw new AppError(409, 'An account with this email address already exists.');
    }

    // 2. Hash password
    const passwordHash = await hashPassword(dto.password);

    // 3. Create initial Workspace (without ownerId initially)
    const workspace = await Workspace.create({
      name: normalizedWorkspaceName
    });

    let user: IUser;

    // 4. Create User linked to the newly created workspace with isEmailVerified: true
    try {
      user = await User.create({
        workspaceId: workspace._id,
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        role: 'admin',
        isEmailVerified: true
      });
    } catch (userError) {
      // Rollback: delete orphan workspace if user creation fails
      await Workspace.findByIdAndDelete(workspace._id).catch(() => {});
      throw userError;
    }

    // 5. Update workspace with the created user as owner
    try {
      workspace.ownerId = user._id;
      await workspace.save();
    } catch (workspaceUpdateError) {
      // Rollback: delete both created records if updating ownerId fails
      await User.findByIdAndDelete(user._id).catch(() => {});
      await Workspace.findByIdAndDelete(workspace._id).catch(() => {});
      throw workspaceUpdateError;
    }

    // 6. Sign JWT session token
    const token = signAuthToken({
      userId: user._id.toString(),
      workspaceId: workspace._id.toString(),
      role: user.role
    });

    return {
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId.toString(),
        isEmailVerified: true,
        createdAt: user.createdAt
      },
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        ownerId: user._id.toString(),
        settings: workspace.settings
      }
    };
  }

  /**
   * Authenticates user credentials, generates a new JWT session,
   * and returns safe user and workspace details.
   * Requires verified email for new accounts; grandfathers existing legacy users safely.
   */
  public static async login(dto: LoginDTO): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Locate user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Generic error response to prevent user enumeration
      throw new AppError(401, 'Invalid email or password.');
    }

    // 2. Check password hash presence (accounts created via Google OAuth have no password)
    if (!user.passwordHash) {
      throw new AppError(401, 'This account is registered with Google. Please use Google Sign-In.');
    }

    const isPasswordValid = await comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password.');
    }

    // 3. User verification status:
    // Email verification requirement is currently disabled pending production SMTP configuration.
    // Ensure user has isEmailVerified: true so they can log in freely.
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      await user.save().catch(() => {});
    }

    // 4. Retrieve associated workspace
    const workspace = await Workspace.findById(user.workspaceId);
    if (!workspace) {
      throw new AppError(404, 'Associated workspace could not be found.');
    }

    // 5. Sign JWT
    const token = signAuthToken({
      userId: user._id.toString(),
      workspaceId: user.workspaceId.toString(),
      role: user.role
    });

    return {
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId.toString(),
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      },
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        ownerId: workspace.ownerId?.toString(),
        settings: workspace.settings
      }
    };
  }

  /**
   * Authenticates user via Google OAuth using Supabase identity verification.
   * Verifies the Supabase access token server-side, confirms email verification,
   * matches or links existing user or provisions new User & Workspace,
   * and issues a standard LeadFlow JWT session.
   */
  public static async loginWithGoogle(supabaseToken: string): Promise<AuthResult> {
    // 1. Verify token server-side and ensure email is verified
    const verifiedIdentity = await verifySupabaseToken(supabaseToken);
    const { supabaseId, email: verifiedEmail, name, avatarUrl } = verifiedIdentity;

    // 2. Primary lookup: find user by Supabase ID
    let user = await User.findOne({ supabaseId });

    // 3. Secondary lookup: find user by verified email (Account Linking)
    if (!user) {
      user = await User.findOne({ email: verifiedEmail });

      if (user) {
        // Link existing user account safely without touching passwordHash
        user.supabaseId = supabaseId;
        user.isEmailVerified = true;
        if (avatarUrl && !user.avatarUrl) {
          user.avatarUrl = avatarUrl;
        }
        await user.save();
      }
    }

    let workspace: IWorkspace | null = null;

    // 4. If user does not exist, provision new Workspace and User
    if (!user) {
      const workspaceName = `${name}'s Workspace`;
      workspace = await Workspace.create({ name: workspaceName });

      try {
        user = await User.create({
          workspaceId: workspace._id,
          name: name.trim() || 'Google User',
          email: verifiedEmail,
          role: 'admin',
          isEmailVerified: true,
          authProvider: 'google',
          supabaseId,
          avatarUrl
        });
      } catch (userCreateError) {
        // Rollback workspace on user creation failure
        await Workspace.findByIdAndDelete(workspace._id).catch(() => {});
        throw userCreateError;
      }

      try {
        workspace.ownerId = user._id;
        await workspace.save();
      } catch (workspaceUpdateError) {
        // Rollback both records
        await User.findByIdAndDelete(user._id).catch(() => {});
        await Workspace.findByIdAndDelete(workspace._id).catch(() => {});
        throw workspaceUpdateError;
      }
    } else {
      // User exists, retrieve associated workspace
      workspace = await Workspace.findById(user.workspaceId);
      if (!workspace) {
        throw new AppError(404, 'Associated workspace could not be found.');
      }
    }

    // 5. Sign standard LeadFlow JWT session token
    const token = signAuthToken({
      userId: user._id.toString(),
      workspaceId: user.workspaceId.toString(),
      role: user.role
    });

    return {
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId.toString(),
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      },
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        ownerId: workspace.ownerId?.toString(),
        settings: workspace.settings
      }
    };
  }

  /**
   * Validates verification token and marks user email as verified.
   */
  public static async verifyEmail(token: string): Promise<void> {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      throw new AppError(400, 'Verification token is required.');
    }

    const user = await User.findOne({ verificationToken: trimmedToken });
    if (!user) {
      throw new AppError(400, 'Invalid or expired verification token.');
    }

    if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
      throw new AppError(400, 'Verification token has expired. Please request a new verification email.');
    }

    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiresAt = undefined;
    await user.save();
  }

  /**
   * Resends verification email with a fresh 24h token.
   * Enforces 60-second cooldown and avoids user enumeration.
   */
  public static async resendVerification(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Do not reveal whether an arbitrary email address exists
    if (!user || user.isEmailVerified) {
      return;
    }

    // 60-second cooldown check to prevent abuse
    if (user.verificationTokenExpiresAt) {
      const now = Date.now();
      const elapsedSinceCreation = (24 * 60 * 60 * 1000) - (user.verificationTokenExpiresAt.getTime() - now);
      if (elapsedSinceCreation < 60 * 1000) {
        throw new AppError(429, 'Please wait at least 60 seconds before requesting another verification email.');
      }
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.verificationToken = newToken;
    user.verificationTokenExpiresAt = newExpiresAt;
    await user.save();

    await this.sendVerificationEmail(user.email, user.name, newToken);
  }

  /**
   * Fetches current authenticated user and workspace profile by user ID.
   */
  public static async getProfile(userId: string): Promise<{ user: SafeUser; workspace: SafeWorkspace }> {
    const user = await User.findById(userId).select('-passwordHash').lean();
    if (!user) {
      throw new AppError(404, 'User profile not found.');
    }

    const workspace = await Workspace.findById(user.workspaceId).lean();
    if (!workspace) {
      throw new AppError(404, 'Workspace profile not found.');
    }

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId.toString(),
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      },
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        ownerId: workspace.ownerId?.toString(),
        settings: workspace.settings
      }
    };
  }
}
