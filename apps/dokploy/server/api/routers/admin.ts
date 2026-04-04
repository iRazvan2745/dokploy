import {
	getWebServerSettings,
	IS_CLOUD,
	runEnterpriseCheck,
	setupWebMonitoring,
	updateWebServerSettings,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { apiUpdateWebServerMonitoring } from "@/server/db/schema";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const adminRouter = createTRPCRouter({
	runEnterpriseCheck: adminProcedure.mutation(async ({ ctx }) => {
		try {
			if (ctx.user.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to run the enterprise check",
				});
			}

			await runEnterpriseCheck();

			return { success: true };
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					error instanceof Error
						? error.message
						: "Failed to run enterprise check",
			});
		}
	}),
	setupMonitoring: adminProcedure
		.input(apiUpdateWebServerMonitoring)
		.mutation(async ({ input }) => {
			try {
				if (IS_CLOUD) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Feature disabled on cloud",
					});
				}

				await updateWebServerSettings({
					metricsConfig: {
						server: {
							type: "Dokploy",
							refreshRate: input.metricsConfig.server.refreshRate,
							port: input.metricsConfig.server.port,
							token: input.metricsConfig.server.token,
							cronJob: input.metricsConfig.server.cronJob,
							urlCallback: input.metricsConfig.server.urlCallback,
							retentionDays: input.metricsConfig.server.retentionDays,
							thresholds: {
								cpu: input.metricsConfig.server.thresholds.cpu,
								memory: input.metricsConfig.server.thresholds.memory,
							},
						},
						containers: {
							refreshRate: input.metricsConfig.containers.refreshRate,
							services: {
								include: input.metricsConfig.containers.services.include || [],
								exclude: input.metricsConfig.containers.services.exclude || [],
							},
						},
					},
				});

				await setupWebMonitoring();
				const settings = await getWebServerSettings();
				return settings;
			} catch (error) {
				throw error;
			}
		}),
});
