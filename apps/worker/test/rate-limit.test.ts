import { expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { rateLimit } from "../src/index";

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
