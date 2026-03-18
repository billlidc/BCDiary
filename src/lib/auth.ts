export function getAllowedEmails(): string[] {
  const value = process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? "";
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAllowedEmails().includes(email.toLowerCase());
}

export function displayNameFromEmail(email?: string | null): string {
  if (!email) return "Memory Keeper";
  return email.split("@")[0].replace(/[._-]/g, " ");
}
