import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorize } from "../src/auth";

afterEach(() => vi.unstubAllGlobals());

describe("generation request authorization", () => {
  it("treats a missing Authorization header as a guest", async () => {
    await expect(authorize(new Request("https://orbit.test"), "https://guest.supabase.co")).resolves.toEqual({ kind: "guest" });
  });

  it("rejects a malformed token instead of downgrading it", async () => {
    await expect(authorize(new Request("https://orbit.test", { headers: { authorization: "Bearer malformed" } }), "https://invalid.supabase.co")).rejects.toThrow("UNAUTHENTICATED");
  });

  it("verifies a valid Supabase JWT", async () => {
    const issuer = "https://valid.supabase.co/auth/v1";
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "orbit-test", alg: "RS256", use: "sig" };
    const token = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "orbit-test" }).setIssuer(issuer).setAudience("authenticated").setSubject("user-123").setExpirationTime("5m").sign(privateKey);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } })));
    await expect(authorize(new Request("https://orbit.test", { headers: { authorization: `Bearer ${token}` } }), "https://valid.supabase.co")).resolves.toEqual({ kind: "authenticated", userId: "user-123", token });
  });
});
