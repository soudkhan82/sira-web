export const PASSWORD_POLICY_TEXT = "At least 8 characters with a letter, number and special character.";
export function isStrongPassword(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}
