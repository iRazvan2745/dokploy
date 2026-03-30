import * as React from "react";
import { cn } from "@/lib/utils";

const buttonGroupItemClassName =
	"rounded-none border-0 border-l border-border first:border-l-0 focus-visible:ring-0";

const ButtonGroup = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		role="group"
		className={cn(
			"inline-flex items-stretch overflow-hidden rounded-lg border border-border",
			className,
		)}
		{...props}
	/>
));

ButtonGroup.displayName = "ButtonGroup";

export { ButtonGroup, buttonGroupItemClassName };
