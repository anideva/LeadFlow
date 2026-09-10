import { IWorkspace } from '../models/Workspace.model';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  workspaceId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      workspace?: IWorkspace;
    }
  }
}
