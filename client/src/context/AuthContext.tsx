import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  Workspace,
  LoginCredentials,
  RegisterData,
  loginUser,
  registerUser,
  getCurrentUser,
  logoutUser
} from '../api/auth.api';

export interface AuthContextType {
  user: User | null;
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check existing session on application boot / browser refresh
  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getCurrentUser();
        if (isMounted) {
          setUser(data.user);
          setWorkspace(data.workspace);
        }
      } catch (err: any) {
        if (isMounted) {
          // If unauthenticated (401), clear user without showing a noisy error banner
          setUser(null);
          setWorkspace(null);
          if (err.message !== 'UNAUTHENTICATED') {
            console.error('[AuthContext] Session check error:', err.message);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await loginUser(credentials);
      setUser(res.data.user);
      setWorkspace(res.data.workspace);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await registerUser(data);
      setUser(res.data.user);
      setWorkspace(res.data.workspace);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      await logoutUser();
    } catch (err: any) {
      console.warn('[AuthContext] Logout warning:', err.message);
    } finally {
      setUser(null);
      setWorkspace(null);
      setError(null);
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        isLoading,
        error,
        login,
        register,
        logout,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
