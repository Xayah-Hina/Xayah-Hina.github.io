import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Env } from "./types";
import { HttpError } from "./utils";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccess(request: Request, env: Env): Promise<JWTPayload> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new HttpError(503, "Cloudflare Access is not configured for the Editor yet.");
  }
  const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new HttpError(403, "A Cloudflare Access login is required.");
  let keySet = keySets.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keySet);
  }
  try {
    const result = await jwtVerify(token, keySet, { issuer, audience: env.ACCESS_AUD });
    return result.payload;
  } catch {
    throw new HttpError(403, "The Cloudflare Access session is invalid or expired.");
  }
}
