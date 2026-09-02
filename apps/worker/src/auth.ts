import { createRemoteJWKSet, jwtVerify } from "jose";

const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authenticate(request: Request, supabaseUrl: string) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const token = header.slice(7);
  const issuer = `${supabaseUrl}/auth/v1`;
  let keyset = keysets.get(issuer);
  if (!keyset) {
    keyset = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    keysets.set(issuer, keyset);
  }
  const { payload } = await jwtVerify(token, keyset, { issuer, audience: "authenticated" });
  if (!payload.sub) throw new Error("UNAUTHENTICATED");
  return { userId: payload.sub, token };
}

