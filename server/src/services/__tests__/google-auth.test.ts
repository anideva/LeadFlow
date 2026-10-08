import { User, IUser } from '../../models/User.model';
import { Workspace } from '../../models/Workspace.model';
import { AuthService } from '../auth.service';
import { setSupabaseTokenVerifierForTesting, SupabaseVerifiedUser } from '../supabase-auth.service';
import { verifyAuthToken } from '../../utils/jwt.util';
import { hashPassword } from '../../utils/password.util';
import mongoose from 'mongoose';

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, details?: any) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}`, details || '');
  }
}

// In-memory test state
const usersMap = new Map<string, any>();
const workspacesMap = new Map<string, any>();

function createMockUserDoc(data: any): any {
  const doc = {
    ...data,
    _id: data._id || new mongoose.Types.ObjectId(),
    save: async function () {
      usersMap.set(this._id.toString(), { ...this });
      return this;
    }
  };
  return doc;
}

// Intercept Mongoose Model methods on User & Workspace for 100% offline self-contained testing
User.findOne = ((query: any) => {
  let matchedDoc: any = null;
  for (const doc of usersMap.values()) {
    if (query.supabaseId && doc.supabaseId === query.supabaseId) {
      matchedDoc = doc;
      break;
    }
    if (query.email && doc.email === query.email) {
      matchedDoc = doc;
      break;
    }
    if (query.verificationToken && doc.verificationToken === query.verificationToken) {
      matchedDoc = doc;
      break;
    }
  }

  const queryObj = {
    lean: async () => (matchedDoc ? { ...matchedDoc } : null),
    then: (resolve: any, reject: any) => {
      const res = matchedDoc ? createMockUserDoc(matchedDoc) : null;
      return Promise.resolve(res).then(resolve, reject);
    }
  };

  return queryObj;
}) as any;

User.findById = ((id: any) => {
  const doc = usersMap.get(id.toString());
  const matchedDoc = doc || null;

  const queryObj = {
    select: () => ({
      lean: async () => (matchedDoc ? { ...matchedDoc } : null),
      then: (resolve: any, reject: any) => {
        const res = matchedDoc ? createMockUserDoc(matchedDoc) : null;
        return Promise.resolve(res).then(resolve, reject);
      }
    }),
    lean: async () => (matchedDoc ? { ...matchedDoc } : null),
    then: (resolve: any, reject: any) => {
      const res = matchedDoc ? createMockUserDoc(matchedDoc) : null;
      return Promise.resolve(res).then(resolve, reject);
    }
  };

  return queryObj;
}) as any;

User.create = (async (data: any) => {
  const id = (data._id || new mongoose.Types.ObjectId()).toString();
  const stored = {
    _id: new mongoose.Types.ObjectId(id),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data
  };
  usersMap.set(id, stored);
  return createMockUserDoc(stored);
}) as any;

User.findByIdAndUpdate = (async (id: any, update: any) => {
  const doc = usersMap.get(id.toString());
  if (!doc) return null;
  const updated = { ...doc, ...update };
  usersMap.set(id.toString(), updated);
  return createMockUserDoc(updated);
}) as any;

User.findByIdAndDelete = (async (id: any) => {
  const doc = usersMap.get(id.toString());
  usersMap.delete(id.toString());
  return doc;
}) as any;

Workspace.create = (async (data: any) => {
  const id = new mongoose.Types.ObjectId().toString();
  const stored = {
    _id: new mongoose.Types.ObjectId(id),
    name: data.name,
    settings: { timezone: 'UTC', currency: 'USD' },
    createdAt: new Date(),
    updatedAt: new Date()
  };
  workspacesMap.set(id, stored);
  const doc = {
    ...stored,
    save: async function () {
      workspacesMap.set(id, { ...this });
      return this;
    }
  };
  return doc;
}) as any;

Workspace.findById = ((id: any) => {
  const doc = workspacesMap.get(id.toString());
  const matchedDoc = doc || null;

  const queryObj = {
    lean: async () => (matchedDoc ? { ...matchedDoc } : null),
    then: (resolve: any, reject: any) => {
      const res = matchedDoc
        ? {
            ...matchedDoc,
            save: async function () {
              workspacesMap.set(id.toString(), { ...this });
              return this;
            }
          }
        : null;
      return Promise.resolve(res).then(resolve, reject);
    }
  };

  return queryObj;
}) as any;

Workspace.findByIdAndDelete = (async (id: any) => {
  const doc = workspacesMap.get(id.toString());
  workspacesMap.delete(id.toString());
  return doc;
}) as any;

// Mock Supabase token verifier
const mockSupabaseTokens: Record<string, SupabaseVerifiedUser | 'INVALID' | 'UNCONFIRMED'> = {
  valid_new_user_token: {
    supabaseId: 'sb-google-uuid-111',
    email: 'newgoogleuser@example.com',
    name: 'Sarah Connor',
    avatarUrl: 'https://lh3.googleusercontent.com/photo1.jpg',
    isEmailConfirmed: true
  },
  valid_existing_google_token: {
    supabaseId: 'sb-google-uuid-111',
    email: 'newgoogleuser@example.com',
    name: 'Sarah Connor',
    avatarUrl: 'https://lh3.googleusercontent.com/photo1.jpg',
    isEmailConfirmed: true
  },
  valid_link_account_token: {
    supabaseId: 'sb-google-uuid-222',
    email: 'existinglocal@example.com',
    name: 'Local John',
    avatarUrl: 'https://lh3.googleusercontent.com/photo2.jpg',
    isEmailConfirmed: true
  },
  invalid_token: 'INVALID',
  unconfirmed_email_token: 'UNCONFIRMED'
};

setSupabaseTokenVerifierForTesting(async (token: string) => {
  const target = mockSupabaseTokens[token];
  if (!target || target === 'INVALID') {
    const err: any = new Error('Invalid or expired Google authentication session. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }
  if (target === 'UNCONFIRMED') {
    const err: any = new Error('Your Google email address has not been confirmed. Please verify your email with Google.');
    err.statusCode = 400;
    throw err;
  }
  return target;
});

async function runGoogleAuthTests() {
  console.log('\n=== LEADFLOW SUPABASE GOOGLE AUTHENTICATION TEST SUITE ===\n');

  // 1. TEST SUCCESSFUL GOOGLE LOGIN FOR A NEW USER
  console.log('--- 1. Testing Google Login for New User ---');
  const newResult = await AuthService.loginWithGoogle('valid_new_user_token');

  assert(typeof newResult.token === 'string' && newResult.token.length > 20, 'Returns signed LeadFlow JWT');
  assert(newResult.user.email === 'newgoogleuser@example.com', 'User email matches Google verified identity');
  assert(newResult.user.name === 'Sarah Connor', 'User name matches Google profile');
  assert(newResult.user.isEmailVerified === true, 'Google authenticated user is email verified');
  assert(typeof newResult.workspace.id === 'string', 'Created dedicated workspace for user');
  assert(newResult.workspace.name.includes('Sarah Connor'), 'Workspace name includes user name');

  // Verify DB state
  const dbUser = usersMap.get(newResult.user.id);
  assert(dbUser !== undefined, 'User document persists in MongoDB');
  assert(dbUser.authProvider === 'google', 'User authProvider is marked as "google"');
  assert(dbUser.supabaseId === 'sb-google-uuid-111', 'User supabaseId is indexed in MongoDB');
  assert(dbUser.passwordHash === undefined, 'No passwordHash created for Google-only user');

  // Verify JWT structure
  const decodedToken = verifyAuthToken(newResult.token);
  assert(decodedToken.userId === newResult.user.id, 'JWT claims userId matches LeadFlow User ID');
  assert(decodedToken.workspaceId === newResult.workspace.id, 'JWT claims workspaceId matches LeadFlow Workspace ID');
  assert(decodedToken.role === 'admin', 'JWT claims role is admin');

  // 2. TEST RE-LOGIN OF EXISTING GOOGLE USER (IDEMPOTENT, NO DUPLICATE CREATION)
  console.log('\n--- 2. Testing Re-Login for Existing Google User ---');
  const userCountBefore = usersMap.size;
  const wsCountBefore = workspacesMap.size;

  const repeatResult = await AuthService.loginWithGoogle('valid_existing_google_token');
  assert(repeatResult.user.id === newResult.user.id, 'Re-login matches existing User document');
  assert(repeatResult.workspace.id === newResult.workspace.id, 'Re-login matches existing Workspace document');
  assert(usersMap.size === userCountBefore, 'No duplicate User document created');
  assert(workspacesMap.size === wsCountBefore, 'No duplicate Workspace document created');

  // 3. TEST SAFE ACCOUNT LINKING FOR EXISTING EMAIL/PASSWORD USER
  console.log('\n--- 3. Testing Safe Account Linking of Existing Email/Password User ---');
  // Seed existing email/password user
  const existingLocalPasswordHash = await hashPassword('ExistingSecret123');
  const localWs = await Workspace.create({ name: 'John Local Workspace' });
  const localUser = await User.create({
    workspaceId: localWs._id,
    name: 'John Local',
    email: 'existinglocal@example.com',
    passwordHash: existingLocalPasswordHash,
    role: 'admin',
    isEmailVerified: true,
    authProvider: 'local'
  });
  localWs.ownerId = localUser._id;
  await localWs.save();

  const userCountBeforeLink = usersMap.size;
  const wsCountBeforeLink = workspacesMap.size;

  // Now authenticate via Google with matching email
  const linkResult = await AuthService.loginWithGoogle('valid_link_account_token');
  assert(linkResult.user.id === localUser._id.toString(), 'Links to the existing LeadFlow User by email');
  assert(linkResult.workspace.id === localWs._id.toString(), 'Retains the user existing Workspace');
  assert(usersMap.size === userCountBeforeLink, 'No new User record created during account linking');
  assert(workspacesMap.size === wsCountBeforeLink, 'No new Workspace created during account linking');

  const linkedUserDoc = usersMap.get(localUser._id.toString());
  assert(linkedUserDoc.supabaseId === 'sb-google-uuid-222', 'Supabase identity ID attached to existing User');
  assert(linkedUserDoc.passwordHash === existingLocalPasswordHash, 'Existing passwordHash preserved completely');

  // 4. TEST REJECTION OF INVALID / EXPIRED SUPABASE TOKEN
  console.log('\n--- 4. Testing Rejection of Invalid / Expired Tokens ---');
  let invalidRejected = false;
  let invalidStatusCode = 0;
  try {
    await AuthService.loginWithGoogle('invalid_token');
  } catch (err: any) {
    invalidRejected = true;
    invalidStatusCode = err.statusCode;
  }
  assert(invalidRejected, 'Invalid Supabase token is rejected with error');
  assert(invalidStatusCode === 401, 'Invalid token returns HTTP 401 Unauthorized');

  // 5. TEST REJECTION OF UNCONFIRMED EMAIL
  console.log('\n--- 5. Testing Rejection of Unconfirmed Google Email ---');
  let unconfirmedRejected = false;
  let unconfirmedStatusCode = 0;
  try {
    await AuthService.loginWithGoogle('unconfirmed_email_token');
  } catch (err: any) {
    unconfirmedRejected = true;
    unconfirmedStatusCode = err.statusCode;
  }
  assert(unconfirmedRejected, 'Unconfirmed email is rejected with error');
  assert(unconfirmedStatusCode === 400, 'Unconfirmed email returns HTTP 400 Bad Request');

  // 6. TEST EXISTING EMAIL/PASSWORD REGRESSION AND GUARD
  console.log('\n--- 6. Testing Email/Password Regression & Passwordless Guard ---');
  // Can existing linked user still log in with email/password?
  const localLoginResult = await AuthService.login({
    email: 'existinglocal@example.com',
    password: 'ExistingSecret123'
  });
  assert(localLoginResult.user.id === localUser._id.toString(), 'Linked user can still log in with email/password');

  // Can a Google-only user with no passwordHash be blocked from standard password login safely?
  let googleOnlyBlocked = false;
  let googleOnlyCode = 0;
  let googleOnlyMsg = '';
  try {
    await AuthService.login({
      email: 'newgoogleuser@example.com',
      password: 'AnyPasswordAttempt'
    });
  } catch (err: any) {
    googleOnlyBlocked = true;
    googleOnlyCode = err.statusCode;
    googleOnlyMsg = err.message;
  }
  assert(googleOnlyBlocked, 'Passwordless Google user rejected on password login attempt');
  assert(googleOnlyCode === 401, 'Passwordless login attempt returns HTTP 401');
  assert(googleOnlyMsg.includes('Google'), 'Error directs user to use Google Sign-In');

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed === total) {
    console.log('ALL GOOGLE AUTHENTICATION TESTS COMPLETED SUCCESSFULLY!\n');
  } else {
    process.exit(1);
  }
}

runGoogleAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
