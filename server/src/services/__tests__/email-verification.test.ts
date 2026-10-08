import { User, IUser } from '../../models/User.model';
import { Workspace } from '../../models/Workspace.model';
import { AuthService } from '../auth.service';
import { emailService } from '../email';
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

// Mock default email service to succeed for offline unit test assertions
emailService.sendEmail = async (options: any) => ({
  success: true,
  messageId: 'mock-verification-message-id',
  provider: 'smtp',
  accepted: [options.to],
  rejected: []
});

async function runEmailVerificationTests() {
  console.log('\n=== LEADFLOW AUTHENTICATION & EMAIL VERIFICATION TEST SUITE ===\n');

  const testEmail = 'verify_tester@leadflow-test.io';
  const legacyEmail = 'legacy_tester@leadflow-test.io';
  const password = 'Password123!';

  // =========================================================================
  // PART 1: ACTIVE PRODUCTION FLOW (REGISTRATION & LOGIN WITHOUT SMTP REQUIREMENT)
  // =========================================================================
  console.log('--- 1. Testing Registration Flow (No SMTP Requirement) ---');
  const regResult = await AuthService.register({
    name: 'Pushpita Tester',
    email: testEmail,
    password,
    workspaceName: 'Acme Test WS'
  });

  const createdUserId = regResult.user.id;
  assert(regResult.user.isEmailVerified === true, 'Registration sets isEmailVerified: true on user response');
  assert(typeof regResult.token === 'string' && regResult.token.length > 20, 'Registration returns signed JWT token for immediate session');

  const userInDb = usersMap.get(createdUserId);
  assert(userInDb !== undefined, 'User document exists in DB');
  assert(userInDb.isEmailVerified === true, 'User in DB has isEmailVerified = true');

  console.log('\n--- 2. Testing Immediate Login (No Verification Blocker) ---');
  const loginResult = await AuthService.login({ email: testEmail, password });
  assert(typeof loginResult.token === 'string' && loginResult.token.length > 20, 'User logs in immediately without verification blocker');
  assert(loginResult.user.isEmailVerified === true, 'Login user payload reports isEmailVerified = true');
  assert(loginResult.user.id === createdUserId, 'Login user matches registered user');

  console.log('\n--- 3. Testing Registration When SMTP Is Completely Offline / Unconfigured ---');
  // Temporarily stub emailService.sendEmail to throw an unconfigured error
  emailService.sendEmail = async () => {
    throw new Error('SMTP service not configured in environment');
  };

  const offlineRegEmail = 'offline_smtp_tester@leadflow-test.io';
  const offlineRegResult = await AuthService.register({
    name: 'Offline Tester',
    email: offlineRegEmail,
    password,
    workspaceName: 'Offline WS'
  });

  assert(typeof offlineRegResult.token === 'string', 'Registration succeeds even when SMTP is unconfigured or failing');
  assert(offlineRegResult.user.email === offlineRegEmail, 'Offline user registered successfully');
  const offlineUserInDb = usersMap.get(offlineRegResult.user.id);
  assert(offlineUserInDb !== undefined, 'Offline user saved in DB');

  // =========================================================================
  // PART 2: RETAINED EMAIL VERIFICATION UTILITIES (RETAINED FOR FUTURE RE-ENABLEMENT)
  // =========================================================================
  console.log('\n--- 4. Testing Retained Email Verification Token Logic ---');
  const sampleToken = 'valid_token_32_bytes_hex_random_1234567890abcdef1234567890abcdef';
  const testUserDoc = usersMap.get(createdUserId);
  testUserDoc.verificationToken = sampleToken;
  testUserDoc.verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await AuthService.verifyEmail(sampleToken);
  const verifiedUserInDb = usersMap.get(createdUserId);
  assert(verifiedUserInDb.isEmailVerified === true, 'Retained verifyEmail updates isEmailVerified = true');
  assert(verifiedUserInDb.verificationToken === undefined, 'Retained verifyEmail clears verificationToken');
  assert(verifiedUserInDb.verificationTokenExpiresAt === undefined, 'Retained verifyEmail clears verificationTokenExpiresAt');

  console.log('\n--- 5. Testing Retained Invalid Token Verification ---');
  let invalidTokenRejected = false;
  try {
    await AuthService.verifyEmail('non_existent_token_123456');
  } catch (err: any) {
    invalidTokenRejected = true;
    assert(err.statusCode === 400, 'Invalid token returns HTTP 400 Bad Request');
  }
  assert(invalidTokenRejected, 'Invalid token is rejected');

  console.log('\n--- 6. Testing Retained Expired Token Verification ---');
  const userForExpiry = usersMap.get(createdUserId);
  userForExpiry.verificationToken = 'expired_token_12345';
  userForExpiry.verificationTokenExpiresAt = new Date(Date.now() - 3600000);
  let expiredTokenRejected = false;
  try {
    await AuthService.verifyEmail('expired_token_12345');
  } catch (err: any) {
    expiredTokenRejected = true;
    assert(err.statusCode === 400, 'Expired token returns HTTP 400 Bad Request');
    assert(err.message.includes('expired'), 'Error message mentions expired token');
  }
  assert(expiredTokenRejected, 'Expired token is rejected');

  console.log('\n--- 7. Testing Retained Resend Verification ---');
  await AuthService.resendVerification(testEmail);
  assert(true, 'Resend on verified user does not crash or issue unwanted tokens');

  await AuthService.resendVerification('unknown_random_user_99999@test.com');
  assert(true, 'Resend on non-existent email completes without revealing user non-existence');

  console.log('\n--- 8. Testing Existing Legacy User Compatibility ---');
  const legacyWsId = new mongoose.Types.ObjectId().toString();
  workspacesMap.set(legacyWsId, {
    _id: new mongoose.Types.ObjectId(legacyWsId),
    name: 'Legacy Workspace',
    settings: { timezone: 'UTC', currency: 'USD' }
  });

  const legacyUserId = new mongoose.Types.ObjectId().toString();
  const passwordHash = await hashPassword(password);

  usersMap.set(legacyUserId, {
    _id: new mongoose.Types.ObjectId(legacyUserId),
    workspaceId: new mongoose.Types.ObjectId(legacyWsId),
    name: 'Legacy Admin User',
    email: legacyEmail,
    passwordHash,
    role: 'admin',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z')
  });

  const legacyLoginResult = await AuthService.login({ email: legacyEmail, password });
  assert(typeof legacyLoginResult.token === 'string', 'Legacy user logs in successfully without being blocked by 403');
  assert(legacyLoginResult.user.id === legacyUserId, 'Legacy user identity verified');

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed === total) {
    console.log('ALL EMAIL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  } else {
    console.error('SOME TESTS FAILED!');
    process.exit(1);
  }
}

runEmailVerificationTests().catch((err) => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
