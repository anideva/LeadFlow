import { User, IUser } from '../models/User.model';
import { Workspace, IWorkspace } from '../models/Workspace.model';
import { hashPassword, comparePassword } from '../utils/password.util';
import { signAuthToken } from '../utils/jwt.util';
import { AppError } from '../utils/error.util';

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

export interface AuthResult {
  token: string;
  user: SafeUser;
  workspace: SafeWorkspace;
}

export class AuthService {
  /**
   * Registers a new user, creates their initial workspace,
   * sets the user as workspace owner with admin role, and returns JWT.
   * Employs safe rollback to prevent orphan records.
   */
  public static async register(dto: RegisterDTO): Promise<AuthResult> {
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

    // 4. Create User linked to the newly created workspace
    try {
      user = await User.create({
        workspaceId: workspace._id,
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        role: 'admin'
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

    // 6. Sign JWT
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
   */
  public static async login(dto: LoginDTO): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Locate user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Generic error response to prevent user enumeration
      throw new AppError(401, 'Invalid email or password.');
    }

    // 2. Compare password against bcrypt hash
    const isPasswordValid = await comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password.');
    }

    // 3. Retrieve associated workspace
    const workspace = await Workspace.findById(user.workspaceId);
    if (!workspace) {
      throw new AppError(404, 'Associated workspace could not be found.');
    }

    // 4. Sign JWT
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
