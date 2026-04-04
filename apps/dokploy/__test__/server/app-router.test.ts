import { describe, expect, it } from "vitest";
import { appRouter } from "@/server/api/root";

describe("app router", () => {
	it("does not register a stripe namespace", () => {
		const routerRecord = (appRouter as { _def?: { record?: Record<string, unknown> } })
			._def?.record;

		expect(routerRecord).toBeDefined();
		expect(Object.keys(routerRecord ?? {})).not.toContain("stripe");
	});
});
