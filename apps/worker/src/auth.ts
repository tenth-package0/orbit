import { createRemoteJWKSet, jwtVerify } from "jose";

const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export type RequestContext = { kind: "guest" } | { kind: "authenticated"; userId: string; token: string };

export async function authorize(request: Request, supabaseUrl: string): Promise<RequestContext> {
  const header = request.headers.get("authorization");
  if (!header) return { kind: "guest" };
  if (!header.startsWith("Bearer ") || header.length <= 7) throw new Error("UNAUTHENTICATED");
  const token = header.slice(7);
  const issuer = `${supabaseUrl}/auth/v1`;
  let keyset = keysets.get(issuer);
  if (!keyset) {
    keyset = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    keysets.set(issuer, keyset);
  }
  try {
    const { payload } = await jwtVerify(token, keyset, { issuer, audience: "authenticated" });
    if (!payload.sub) throw new Error("UNAUTHENTICATED");
    return { kind: "authenticated", userId: payload.sub, token };
  } catch {
    throw new Error("UNAUTHENTICATED");
  }
}
