import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { LicenseKeySettings } from "@/components/proprietary/license-keys/license-key";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { toast } from "sonner";

const Page = () => {
	const utils = api.useUtils();
	const { mutateAsync: runEnterpriseCheckNow, isPending: isRunningEnterpriseCheck } =
		api.admin.runEnterpriseCheck.useMutation();

	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<div className="p-6">
							<div className="mb-4 flex justify-end">
								<Button
									variant="outline"
									isLoading={isRunningEnterpriseCheck}
									onClick={async () => {
										try {
											await runEnterpriseCheckNow();
											await utils.licenseKey.haveValidLicenseKey.invalidate();
											toast.success("Enterprise check completed");
										} catch (error) {
											console.error(error);
											toast.error(
												error instanceof Error
													? error.message
													: "Failed to run enterprise check",
											);
										}
									}}
								>
									Run Enterprise Check
								</Button>
							</div>
							<LicenseKeySettings />
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="License">{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	if (user.role !== "owner") {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/settings/profile",
			},
		};
	}

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});
	await helpers.user.get.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
