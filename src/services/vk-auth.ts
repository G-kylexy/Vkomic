import * as Crypto from "expo-crypto";

export const VK_ANDROID_CLIENT_ID = "54761286";
export const VK_ANDROID_REDIRECT_URI = `vk${VK_ANDROID_CLIENT_ID}://vk.ru`;
export const VK_AUTHORIZATION_ENDPOINT = "https://id.vk.ru/authorize";
export const VK_TOKEN_ENDPOINT = "https://id.vk.ru/oauth2/auth";
export const VK_API_SCOPE = "docs";

export interface VkAuthSession {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  expiresAt: number;
}

interface VkTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  device_id?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

const randomHex = async (byteLength: number): Promise<string> => {
  const bytes = await Crypto.getRandomBytesAsync(byteLength);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const base64Url = (value: string): string =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export const createVkAuthorizationRequest = async (): Promise<{
  url: string;
  state: string;
  codeVerifier: string;
}> => {
  const [state, codeVerifier] = await Promise.all([randomHex(24), randomHex(32)]);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );

  const params = new URLSearchParams({
    client_id: VK_ANDROID_CLIENT_ID,
    redirect_uri: VK_ANDROID_REDIRECT_URI,
    response_type: "code",
    code_challenge: base64Url(digest),
    code_challenge_method: "s256",
    state,
    scope: VK_API_SCOPE,
  });

  return {
    url: `${VK_AUTHORIZATION_ENDPOINT}?${params.toString()}`,
    state,
    codeVerifier,
  };
};

const parseTokenResponse = async (
  response: Response,
  expectedState: string,
  fallbackDeviceId: string,
): Promise<VkAuthSession> => {
  const data = (await response.json()) as VkTokenResponse;
  if (!response.ok || data.error || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || data.error || "VK ID a refusé la connexion.");
  }
  if (data.state && data.state !== expectedState) {
    throw new Error("La réponse VK ID ne correspond pas à la demande de connexion.");
  }

  const expiresIn = Math.max(Number(data.expires_in || 3600), 60);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    deviceId: data.device_id || fallbackDeviceId,
    expiresAt: Date.now() + expiresIn * 1000,
  };
};

export const exchangeVkAuthorizationCode = async (
  code: string,
  deviceId: string,
  state: string,
  codeVerifier: string,
): Promise<VkAuthSession> => {
  const query = new URLSearchParams({
    grant_type: "authorization_code",
    redirect_uri: VK_ANDROID_REDIRECT_URI,
    client_id: VK_ANDROID_CLIENT_ID,
    code_verifier: codeVerifier,
    state,
    device_id: deviceId,
  });
  const response = await fetch(`${VK_TOKEN_ENDPOINT}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code }).toString(),
  });
  return parseTokenResponse(response, state, deviceId);
};

export const refreshVkAccessToken = async (
  refreshToken: string,
  deviceId: string,
): Promise<VkAuthSession> => {
  const state = await randomHex(24);
  const query = new URLSearchParams({
    grant_type: "refresh_token",
    redirect_uri: VK_ANDROID_REDIRECT_URI,
    client_id: VK_ANDROID_CLIENT_ID,
    state,
    device_id: deviceId,
  });
  const response = await fetch(`${VK_TOKEN_ENDPOINT}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken }).toString(),
  });
  return parseTokenResponse(response, state, deviceId);
};
