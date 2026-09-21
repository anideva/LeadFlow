export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceId: string;
  createdAt?: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId?: string;
  settings?: Record<string, any>;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data: {
    user: User;
    workspace: Workspace;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

/**
 * Authenticates user credentials via POST /api/auth/login.
 * Backend sets the secure HTTP-only 'leadflow_auth' cookie.
 * JWT is never returned directly and never stored in localStorage/sessionStorage.
 */
export async function loginUser(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || 'Invalid credentials or login failed.');
  }

  return json;
}

/**
 * Registers a new user and workspace via POST /api/auth/register.
 * Backend sets the secure HTTP-only 'leadflow_auth' cookie.
 */
export async function registerUser(data: RegisterData): Promise<AuthResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      password: data.password,
      workspaceName: data.workspaceName.trim()
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || 'Registration failed. Please check your information.');
  }

  return json;
}

/**
 * Fetches the currently authenticated user session via GET /api/auth/me.
 * Validates the existing HTTP-only cookie on application boot / refresh.
 */
export async function getCurrentUser(): Promise<{ user: User; workspace: Workspace }> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include'
  });

  if (response.status === 401) {
    throw new Error('UNAUTHENTICATED');
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || 'Failed to fetch user session.');
  }

  return json.data;
}

/**
 * Terminates the user session via POST /api/auth/logout.
 * Backend clears the 'leadflow_auth' HTTP-only cookie.
 */
export async function logoutUser(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.error || 'Logout failed.');
  }
}
