import { expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { guestRateLimit, rateLimit } from "../src/index";

it("charges comparisons per provider without making the interaction burst impossible", async () => {
  const burst = vi.fn().mockResolvedValue({ success: true });
  const minute = vi.fn().mockResolvedValue({ success: true });
  const address = vi.fn().mockResolvedValue({ success: true });
  const env = { USER_BURST: { limit: burst }, USER_MINUTE: { limit: minute }, IP_MINUTE: { limit: address } } as unknown as Env;

  await expect(rateLimit(env, "user", "ip", 3)).resolves.toBe(true);
  expect(burst).toHaveBeenCalledTimes(1);
  expect(minute).toHaveBeenCalledTimes(3);
  expect(address).toHaveBeenCalledTimes(3);
});

it("charges guest comparisons against the guest IP budget", async () => {
  const burst = vi.fn().mockResolvedValue({ success: true });
  const minute = vi.fn().mockResolvedValue({ success: true });
  const env = { GUEST_BURST: { limit: burst }, GUEST_MINUTE: { limit: minute } } as unknown as Env;

  await expect(guestRateLimit(env, "ip", 3)).resolves.toBe(true);
  expect(burst).toHaveBeenCalledTimes(1);
  expect(minute).toHaveBeenCalledTimes(3);
});

it("keeps guest and authenticated bindings separate", async () => {
  const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
  const env = { USER_BURST: limiter(), USER_MINUTE: limiter(), IP_MINUTE: limiter(), GUEST_BURST: limiter(), GUEST_MINUTE: limiter() } as unknown as Env;
  await rateLimit(env, "user", "ip", 1);
  expect(env.GUEST_MINUTE.limit).not.toHaveBeenCalled();
  await guestRateLimit(env, "ip", 1);
  expect(env.USER_MINUTE.limit).toHaveBeenCalledTimes(1);
  expect(env.GUEST_MINUTE.limit).toHaveBeenCalledTimes(1);
});
