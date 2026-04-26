export function formatPublicName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const last = parts[parts.length - 1];

  return `${first} ${last.charAt(0)}.`;
}