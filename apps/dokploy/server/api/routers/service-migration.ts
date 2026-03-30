import {
	isMigratableServiceType,
	logMigrationPreflight,
	migrateServiceBetweenServers,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const migrateServiceSchema = z.object({
	serviceType: z.enum([
		"application",
		"compose",
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
		"libsql",
	]),
	serviceId: z.string().min(1),
	targetServerId: z.string().min(1),
});

export const serviceMigrationRouter = createTRPCRouter({
	migrateWithLogs: protectedProcedure
		.input(migrateServiceSchema)
		.subscription(({ input, ctx }) => {
			if (!isMigratableServiceType(input.serviceType)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unsupported service type",
				});
			}

			return observable<string>((emit) => {
				const runMigration = async () => {
					try {
						await checkServicePermissionAndAccess(ctx, input.serviceId, {
							service: ["create"],
						});

						await logMigrationPreflight({
							serviceType: input.serviceType,
							serviceId: input.serviceId,
							targetServerId: input.targetServerId,
							onData: (data) => emit.next(data),
						});

						const result = await migrateServiceBetweenServers({
							serviceType: input.serviceType,
							serviceId: input.serviceId,
							targetServerId: input.targetServerId,
							onData: (data) => emit.next(data),
						});

						await audit(ctx, {
							action: "move",
							resourceType: "service",
							resourceId: input.serviceId,
							resourceName: result.name,
							metadata: {
								serviceType: input.serviceType,
								sourceServerId: result.sourceServerId,
								sourceServerName: result.sourceServerName,
								targetServerId: result.targetServerId,
								targetServerName: result.targetServerName,
							},
						});

						emit.next("Migration finished successfully");
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Migration failed";
						emit.next(message);
					} finally {
						emit.complete();
					}
				};

				void runMigration();
			});
		}),
});
