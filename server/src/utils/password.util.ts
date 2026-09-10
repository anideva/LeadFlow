import bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcryptjs with 10 salt rounds.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(password, salt);
};

/**
 * Compares a candidate plaintext password against a stored bcrypt hash.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
