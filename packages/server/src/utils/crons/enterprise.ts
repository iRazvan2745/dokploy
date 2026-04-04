import { eq } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import { user as userSchema } from "../../db/schema/user";

export const LICENSE_KEY_URL =
	// process.env.NODE_ENV === "development"
	// 	? "http://localhost:4002"
	"https://licenses-api.dokploy.com";

export const runEnterpriseCheck = async () => {
	console.log("Doing wonders!");
	const users = await db.query.user.findMany();
	for (const user of users) {
		console.log(`Updating ${user.email}`);
		await db
			.update(userSchema)
			.set({
				isValidEnterpriseLicense: true,
				enableEnterpriseFeatures: true,
				enablePaidFeatures: true,
				licenseKey: "forkploy-is-goated-and-license-compliant",
			})
			.where(eq(userSchema.id, user.id));
	}
};

export const initEnterpriseBackupCronJobs = async () => {
	scheduleJob("enterprise-check", "*/10 * * * *", async () => {
		await runEnterpriseCheck();
	});
};

export const validateLicenseKey = async (_licenseKey: string) => {
	try {
		return true;
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : "Failed to validate license key",
		);
		throw error;
	}
};
