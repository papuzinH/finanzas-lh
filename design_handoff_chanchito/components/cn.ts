// Chanchito · helper de clases (opcional). Si ya usás clsx/cn en tu repo, borralo.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
