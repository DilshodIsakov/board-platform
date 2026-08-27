import i18n from "../i18n";

const MB = 1024 * 1024;

/**
 * Клиентские лимиты размера файлов.
 * Должны совпадать с file_size_limit бакетов (миграция 064):
 *   documents — 50 MB, chat-attachments — 25 MB, board-task-files — 25 MB.
 */
export const FILE_LIMITS = {
  document: 50 * MB,
  chat: 25 * MB,
  task: 25 * MB,
} as const;

export type FileContext = keyof typeof FILE_LIMITS;

/** Исполняемые форматы, которым нечего делать в документообороте совета. */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "cpl",
  "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "jar",
]);

/**
 * Проверить файл перед загрузкой в Storage.
 * Бросает Error с локализованным сообщением — вызывающий код уже
 * показывает error.message пользователю.
 */
export function assertFileAllowed(file: File, context: FileContext): void {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(i18n.t("fileValidation.blockedType", { ext }));
  }

  const limit = FILE_LIMITS[context];
  if (file.size > limit) {
    throw new Error(
      i18n.t("fileValidation.tooLarge", {
        name: file.name,
        max: Math.round(limit / MB),
      })
    );
  }
}
