import { supabase } from "./supabaseClient";

/**
 * Двухфакторная аутентификация (TOTP) через Supabase MFA.
 * Включение — в профиле (TwoFactorSettings), проверка при входе —
 * MfaChallengePage (гейт в App.tsx по assurance level aal1 → aal2).
 */

export interface TotpFactorInfo {
  id: string;
  status: "verified" | "unverified";
}

/** Верифицированные TOTP-факторы пользователя (обычно 0 или 1) */
export async function listVerifiedTotpFactors(): Promise<TotpFactorInfo[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  // data.totp уже содержит только верифицированные TOTP-факторы
  return (data.totp || []).map((f) => ({ id: f.id, status: "verified" as const }));
}

/**
 * Начать включение 2FA: создаёт TOTP-фактор и возвращает QR-код (SVG-строка)
 * и секрет для ручного ввода. Незавершённые попытки предварительно удаляются,
 * иначе повторный enroll падает с ошибкой дубликата.
 */
export async function startTotpEnrollment(): Promise<{
  factorId: string;
  qrCode: string;
  secret: string;
}> {
  // data.totp содержит только верифицированные факторы,
  // незавершённые попытки ищем в data.all
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) throw new Error(error.message);
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/** Подтвердить включение 2FA кодом из приложения-аутентификатора */
export async function confirmTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: chError } = await supabase.auth.mfa.challenge({ factorId });
  if (chError) throw new Error(chError.message);

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (error) throw new Error(error.message);
}

/** Отключить 2FA (удалить фактор) */
export async function disableTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}

/**
 * Нужен ли второй фактор для текущей сессии:
 * пользователь вошёл по паролю (aal1), но у него есть верифицированный
 * TOTP-фактор (nextLevel = aal2).
 */
export async function mfaChallengeRequired(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== data.nextLevel;
}

/** Проверить код при входе (поднимает сессию до aal2) */
export async function verifyMfaChallenge(code: string): Promise<void> {
  const factors = await listVerifiedTotpFactors();
  const factor = factors[0];
  if (!factor) throw new Error("No verified TOTP factor");

  const { data: challenge, error: chError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (chError) throw new Error(chError.message);

  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });
  if (error) throw new Error(error.message);
}
