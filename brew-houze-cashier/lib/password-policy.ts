// The password rules, for every place a password is set: staff and customer accounts, changes and
// resets. brew-houze-admin, brew-houze-cashier and brew-houze-mobile keep identical copies of this
// file, and it also runs in the browser so the forms can show the same checklist.
//
// A password needs 8 to 72 characters, at least one letter and one number, and must not be one of
// the most common passwords or contain the person's own name, email or username, or the café's
// name. Spaces inside are fine; passwords are never trimmed. Existing passwords keep working: the
// rules apply only when a password is set.

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes of a password, so longer ones are refused rather than
// silently cut short.
export const MAX_PASSWORD_LENGTH = 72;

// Shown under password fields.
export const PASSWORD_HINT = "At least 8 characters, with a letter and a number. Avoid your name and common passwords.";

const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "123123123", "11111111", "00000000", "88888888", "87654321", "12341234",
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword", "pa$$word", "password!", "password@123",
  "qwerty123", "qwertyui", "qwerty12", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "asdfghjk", "asdf1234", "abcd1234",
  "abc12345", "abc123456", "a1b2c3d4", "iloveyou", "iloveyou1", "iloveyou2", "sunshine1", "princess1", "football1", "baseball1",
  "welcome1", "welcome123", "letmein1", "admin123", "admin1234", "administrator", "changeme", "changeme1", "trustno1", "monkey123",
  "dragon123", "master123", "superman1", "batman123", "starwars1", "michael1", "jessica1", "charlie1", "computer1", "internet1",
  "mahalkita", "mahalkita1", "iloveyou143", "pilipinas", "philippines", "maganda123", "pogi1234", "tagalog1", "manila123", "jesus123",
  "coffee123", "coffee1234", "barista1", "barista123", "cashier1", "cashier123", "kitchen1", "staff123", "staff1234", "customer1",
  "test1234", "testing1", "testing123", "guest123", "user1234", "login123", "secret12", "secret123", "default1", "temp1234",
]);

// Café words nobody should build a password on.
const CAFE_WORDS = ["brewhouze", "brew houze", "barista"];

export type PasswordAbout = { name?: string | null; email?: string | null; username?: string | null };

// For the checklist under password fields.
export function passwordChecks(password: string): { length: boolean; letterAndNumber: boolean } {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH && password.trim().length > 0,
    letterAndNumber: /\p{L}/u.test(password) && /\p{N}/u.test(password),
  };
}

const byteLength = (value: string) => new TextEncoder().encode(value).length;

// Words from the person's own details that a password must not contain: each part of their name,
// the part of their email before the @, and their username, when at least 3 characters long.
function personalWords(about: PasswordAbout): string[] {
  const words = [
    ...String(about.name ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u),
    String(about.email ?? "").toLowerCase().split("@")[0],
    String(about.username ?? "").toLowerCase(),
  ];
  return [...new Set(words.filter((word) => word.length >= 3))];
}

// Why a new password is not allowed, or null when it is fine.
export function passwordProblem(password: string, about: PasswordAbout = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
  if (!password.trim()) return "A password can't be only spaces.";
  if (byteLength(password) > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters for the password.`;
  if (!passwordChecks(password).letterAndNumber) return "Use at least one letter and one number in the password.";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(lower.replace(/[^a-z0-9@$]+$/, ""))) return "That password is too common and easy to guess. Choose a different one.";
  // The same character over and over ("aaaa1111") or a straight run ("abcd1234").
  if (/^(.)\1+$/.test(lower.replace(/\d/g, "")) && /^(.)\1+$/.test(lower.replace(/\D/g, ""))) return "That password is too easy to guess. Choose a different one.";
  if (CAFE_WORDS.some((word) => lower.includes(word))) return "Don't use the café's name in the password.";
  if (personalWords(about).some((word) => lower.includes(word))) return "Don't use your own name, email or username in the password.";
  return null;
}
