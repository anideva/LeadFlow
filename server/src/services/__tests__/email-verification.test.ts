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
  console.log('\n=== LEADFLOW EMAIL VERIFICATION COMPREHENSIVE SUITE ===\n');

  const testEmail = 'verify_tester@leadflow-test.io';
  const legacyEmail = 'legacy_tester@leadflow-test.io';
  const password = 'Password123!';

  // 1. TEST REGISTRATION
  console.log('--- 1. Testing Registration Flow ---');
  const regResult = await AuthService.register({
    name: 'Pushpita Tester',
    email: testEmail,
    password,
    workspaceName: 'Acme Test WS'
  });

  const createdUserId = regResult.user.id;
  assert(regResult.user.isEmailVerified === false, 'Registration sets isEmailVerified: false on user response');
  assert((regResult as any).token === undefined, 'Registration does NOT return a JWT token (no auto-login)');

  const userInDb = usersMap.get(createdUserId);
  assert(userInDb !== undefined, 'User document exists in DB');
  assert(userInDb.isEmailVerified === false, 'User in DB has isEmailVerified = false');
  assert(typeof userInDb.verificationToken === 'string' && userInDb.verificationToken.length === 64, 'User in DB has 64-char hex verificationToken');
  assert(userInDb.verificationTokenExpiresAt instanceof Date, 'User in DB has verificationTokenExpiresAt Date');

  // Check expiration is roughly 24 hours in the future (+/- 10 minutes)
  const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
  const actualExpiry = userInDb.verificationTokenExpiresAt.getTime();
  assert(Math.abs(actualExpiry - expectedExpiry) < 600000, 'Verification token expiration is approximately 24 hours');

  const token = userInDb.verificationToken;

  // 2. TEST LOGIN BEFORE VERIFICATION
  console.log('\n--- 2. Testing Login Guard for Unverified Account ---');
  let loginBlocked = false;
  let loginErrorCode = 0;
  let loginErrorMessage = '';

  try {
    await AuthService.login({ email: testEmail, password });
  } catch (err: any) {
    loginBlocked = true;
    loginErrorCode = err.statusCode;
    loginErrorMessage = err.message;
  }

  assert(loginBlocked, 'Unverified user login attempt is blocked');
  assert(loginErrorCode === 403, 'Unverified user login returns HTTP 403 Forbidden');
  assert(loginErrorMessage === 'Please verify your email address before logging in.', 'Returns correct unverified message');

  // 3. TEST INVALID TOKEN VERIFICATION
  console.log('\n--- 3. Testing Invalid Token Verification ---');
  let invalidTokenRejected = false;
  try {
    await AuthService.verifyEmail('non_existent_token_123456');
  } catch (err: any) {
    invalidTokenRejected = true;
    assert(err.statusCode === 400, 'Invalid token returns HTTP 400 Bad Request');
  }
  assert(invalidTokenRejected, 'Invalid token is rejected');

  // 4. TEST EXPIRED TOKEN VERIFICATION
  console.log('\n--- 4. Testing Expired Token Verification ---');
  // Temporarily set expiry to 1 hour in the past
  userInDb.verificationTokenExpiresAt = new Date(Date.now() - 3600000);

  let expiredTokenRejected = false;
  try {
    await AuthService.verifyEmail(token);
  } catch (err: any) {
    expiredTokenRejected = true;
    assert(err.statusCode === 400, 'Expired token returns HTTP 400 Bad Request');
    assert(err.message.includes('expired'), 'Error message mentions expired token');
  }
  assert(expiredTokenRejected, 'Expired token is rejected');

  // Restore token expiry
  userInDb.verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // 5. TEST SUCCESSFUL VERIFICATION
  console.log('\n--- 5. Testing Valid Token Verification ---');
  await AuthService.verifyEmail(token);

  const verifiedUserInDb = usersMap.get(createdUserId);
  assert(verifiedUserInDb.isEmailVerified === true, 'Verification updates isEmailVerified = true');
  assert(verifiedUserInDb.verificationToken === undefined, 'Verification removes verificationToken from document');
  assert(verifiedUserInDb.verificationTokenExpiresAt === undefined, 'Verification removes verificationTokenExpiresAt');

  // 6. TEST LOGIN AFTER VERIFICATION
  console.log('\n--- 6. Testing Login After Verification ---');
  const loginResult = await AuthService.login({ email: testEmail, password });
  assert(typeof loginResult.token === 'string' && loginResult.token.length > 20, 'Verified user login successfully issues JWT token');
  assert(loginResult.user.isEmailVerified === true, 'Login user payload reports isEmailVerified = true');
  assert(loginResult.user.id === createdUserId, 'Login user matches registered user');

  // 7. TEST RESEND VERIFICATION
  console.log('\n--- 7. Testing Resend Verification ---');
  // For already verified user: should silently complete without modifying user
  await AuthService.resendVerification(testEmail);
  const userAfterVerifiedResend = usersMap.get(createdUserId);
  assert(userAfterVerifiedResend.isEmailVerified === true, 'Resend on verified user does not alter verified status');
  assert(userAfterVerifiedResend.verificationToken === undefined, 'Resend on verified user does not issue token');

  // For arbitrary unknown email: should complete without error (no user enumeration)
  await AuthService.resendVerification('unknown_random_user_99999@test.com');
  assert(true, 'Resend on non-existent email completes without revealing user non-existence');

  // Test cooldown on an unverified user
  const unverifiedEmail = 'unverified_cooldown@leadflow-test.io';
  const unverifiedReg = await AuthService.register({
    name: 'Cooldown Tester',
    email: unverifiedEmail,
    password,
    workspaceName: 'Cooldown WS'
  });

  let cooldownTriggered = false;
  try {
    // Trying to resend immediately (< 60s) should hit cooldown
    await AuthService.resendVerification(unverifiedEmail);
  } catch (err: any) {
    if (err.statusCode === 429) {
      cooldownTriggered = true;
    }
  }
  assert(cooldownTriggered, 'Resending verification within 60s triggers HTTP 429 cooldown');

  // 8. TEST LEGACY USER BACKWARD COMPATIBILITY
  console.log('\n--- 8. Testing Existing Legacy User Compatibility ---');
  const legacyWsId = new mongoose.Types.ObjectId().toString();
  workspacesMap.set(legacyWsId, {
    _id: new mongoose.Types.ObjectId(legacyWsId),
    name: 'Legacy Workspace',
    settings: { timezone: 'UTC', currency: 'USD' }
  });

  const legacyUserId = new mongoose.Types.ObjectId().toString();
  const passwordHash = await hashPassword(password);

  // Directly insert raw legacy document lacking isEmailVerified, verificationToken, and verificationTokenExpiresAt
  usersMap.set(legacyUserId, {
    _id: new mongoose.Types.ObjectId(legacyUserId),
    workspaceId: new mongoose.Types.ObjectId(legacyWsId),
    name: 'Legacy Admin User',
    email: legacyEmail,
    passwordHash,
    role: 'admin',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z')
    // Note: isEmailVerified, verificationToken, verificationTokenExpiresAt are undefined!
  });

  const rawLegacyDoc = usersMap.get(legacyUserId);
  assert(rawLegacyDoc.isEmailVerified === undefined, 'Raw legacy document in DB has no isEmailVerified field');
  assert(rawLegacyDoc.verificationToken === undefined, 'Raw legacy document in DB has no verificationToken field');

  // Attempt login as legacy user: MUST SUCCEED without 403!
  const legacyLoginResult = await AuthService.login({ email: legacyEmail, password });
  assert(typeof legacyLoginResult.token === 'string', 'Legacy user logs in successfully without being blocked by 403');
  assert(legacyLoginResult.user.id === legacyUserId, 'Legacy user identity verified');

  const upgradedLegacyDoc = usersMap.get(legacyUserId);
  assert(upgradedLegacyDoc.isEmailVerified === true, 'Legacy user is self-healed to isEmailVerified = true on login');

  // 9. TEST REGISTRATION EMAIL FAILURE & ATOMIC ROLLBACK
  console.log('\n--- 9. Testing Registration Email Failure Rollback ---');
  const failEmail = 'delivery_fail_tester@leadflow-test.io';
  const initialUserCount = usersMap.size;
  const initialWsCount = workspacesMap.size;

  // Simulate SMTP failure
  emailService.sendEmail = async () => {
    throw new Error('SMTP connection timed out or rejected');
  };

  let regFailed = false;
  let regErrorCode = 0;
  let regErrorMessage = '';

  try {
    await AuthService.register({
      name: 'Fail Tester',
      email: failEmail,
      password,
      workspaceName: 'Fail WS'
    });
  } catch (err: any) {
    regFailed = true;
    regErrorCode = err.statusCode;
    regErrorMessage = err.message;
  }

  assert(regFailed, 'Registration throws an error when verification email delivery fails');
  assert(regErrorCode === 502, 'Email failure returns HTTP 502 Bad Gateway');
  assert(regErrorMessage === 'Failed to send verification email. Please try again later.', 'Returns sanitized error message without leaking SMTP details');
  assert(!regErrorMessage.includes('SMTP') && !regErrorMessage.includes('timed out'), 'No internal SMTP error details exposed in message');

  // Assert atomic rollback: user and workspace must be deleted
  assert(usersMap.size === initialUserCount, 'User document is rolled back on email delivery failure');
  assert(workspacesMap.size === initialWsCount, 'Workspace document is rolled back on email delivery failure');

  let leakedUserInDb = null;
  for (const doc of usersMap.values()) {
    if (doc.email === failEmail) {
      leakedUserInDb = doc;
      break;
    }
  }
  assert(leakedUserInDb === null, 'No orphan user document left in database');

  // Restore emailService.sendEmail
  emailService.sendEmail = async (options: any) => ({
    success: true,
    messageId: 'mock-verification-message-id',
    provider: 'smtp',
    accepted: [options.to],
    rejected: []
  });

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
