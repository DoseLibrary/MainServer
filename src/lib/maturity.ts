/**
 * Client mirror of the server's maturity ladder (`src/server/maturity.ts`).
 * The server is the authority on what a limit hides; this only labels the
 * choices an administrator picks from.
 */
export const MATURITY_CHOICES: Array<{ level: number; label: string; description: string }> = [
  { level: 0, label: 'Little kids', description: 'G · TV-Y · TV-G' },
  { level: 7, label: 'Older kids', description: 'TV-Y7 and below' },
  { level: 10, label: 'Family', description: 'PG · TV-PG and below' },
  { level: 13, label: 'Teens', description: 'PG-13 and below' },
  { level: 14, label: 'Older teens', description: 'TV-14 and below' },
  { level: 17, label: 'Mature', description: 'R · TV-MA and below' },
];

export function maturityLabel(level: number | null | undefined): string {
  if (level == null) return 'Can watch everything';
  const choice = MATURITY_CHOICES.find((entry) => entry.level === level);
  return choice ? `Can watch ${choice.label.toLowerCase()} (${choice.description})` : `Limited to level ${level}`;
}
