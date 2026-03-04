/**
 * Maps raw voice/Realtime API errors to user-friendly messages and suggested actions.
 */

export interface VoiceErrorInfo {
  message: string;
  action: string;
}

const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /network/i,
  /fetch failed/i,
  /connection refused/i,
  /timeout/i,
  /aborted/i,
];

const AUTH_PATTERNS = [
  /unauthorized/i,
  /401/i,
  /invalid.*token/i,
  /api.*key/i,
];

const MIC_PATTERNS = [
  /notallowederror/i,
  /permission denied/i,
  /permission_denied/i,
  /user denied/i,
  /getusermedia/i,
];

const TOKEN_EXPIRY_PATTERNS = [
  /session expired/i,
  /token.*expired/i,
  /expired/i,
];

const API_PATTERNS = [
  /openai realtime/i,
  /realtime.*error/i,
  /realtime.*failed/i,
];

function matchesAny(str: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(str));
}

export function normalizeVoiceError(raw: string | Error): VoiceErrorInfo {
  const str = typeof raw === "string" ? raw : raw.message;

  if (matchesAny(str, MIC_PATTERNS)) {
    return {
      message: "Microphone access was denied.",
      action: "Allow mic in your browser settings and tap Reconnect to try again.",
    };
  }

  if (matchesAny(str, TOKEN_EXPIRY_PATTERNS)) {
    return {
      message: "Connection expired.",
      action: "Tap Reconnect to continue.",
    };
  }

  if (matchesAny(str, NETWORK_PATTERNS)) {
    return {
      message: "Connection failed. Check your internet connection.",
      action: "Tap Reconnect to try again.",
    };
  }

  if (matchesAny(str, AUTH_PATTERNS)) {
    return {
      message: "Voice service authentication failed.",
      action: "Refresh the page and try again.",
    };
  }

  if (matchesAny(str, API_PATTERNS)) {
    return {
      message: "Voice service is temporarily unavailable.",
      action: "Tap Reconnect to try again.",
    };
  }

  return {
    message: "Something went wrong with voice.",
    action: "Tap Reconnect to try again.",
  };
}

export function isMicDenialError(raw: string | Error): boolean {
  const str = typeof raw === "string" ? raw : raw.message;
  return matchesAny(str, MIC_PATTERNS);
}

export function isTokenExpiryError(raw: string | Error): boolean {
  const str = typeof raw === "string" ? raw : raw.message;
  return matchesAny(str, TOKEN_EXPIRY_PATTERNS);
}

export type VoiceErrorCategory =
  | "network"
  | "auth"
  | "mic"
  | "token_expiry"
  | "api"
  | "unknown";

export function classifyVoiceError(raw: string | Error): VoiceErrorCategory {
  const str = typeof raw === "string" ? raw : raw.message;

  if (matchesAny(str, MIC_PATTERNS)) return "mic";
  if (matchesAny(str, TOKEN_EXPIRY_PATTERNS)) return "token_expiry";
  if (matchesAny(str, NETWORK_PATTERNS)) return "network";
  if (matchesAny(str, AUTH_PATTERNS)) return "auth";
  if (matchesAny(str, API_PATTERNS)) return "api";

  return "unknown";
}
