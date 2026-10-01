export const VOICE_OPTIONS = [
  { id: "gulf", label: "Gulf Arabic", nativeLabel: "الخليجية" },
  { id: "egyptian", label: "Egyptian Arabic", nativeLabel: "المصرية" },
  { id: "levantine", label: "Levantine Arabic", nativeLabel: "الشامية" },
  { id: "iraqi", label: "Iraqi Arabic", nativeLabel: "العراقية" },
  { id: "moroccan", label: "Moroccan Darija", nativeLabel: "الدارجة المغربية" },
  { id: "english", label: "English (US)", nativeLabel: "English" },
] as const;

export type VoiceOptionId = (typeof VOICE_OPTIONS)[number]["id"];
