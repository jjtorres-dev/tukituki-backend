/**
 * Deriva la inicial del apellido para presentación entre apps
 * ("Pérez" -> "P."), nunca persistida en DB. Vacío si no hay
 * apellido real (legacy/blank) — nunca inventa un punto suelto.
 */
export function deriveLastNameInitial(lastName: string): string {
  const trimmed = lastName.trim();

  return trimmed.length > 0 ? `${trimmed.charAt(0).toUpperCase()}.` : '';
}
