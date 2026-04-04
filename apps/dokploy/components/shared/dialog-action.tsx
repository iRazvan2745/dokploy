import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as React from "react";

interface Props {
	title?: string | React.ReactNode;
	description?: string | React.ReactNode;
	onClick: () => void;
	children?: React.ReactNode;
	disabled?: boolean;
	type?: "default" | "destructive";
}

export const DialogAction = ({
	onClick,
	children,
	description,
	title,
	disabled,
	type,
}: Props) => {
	const [open, setOpen] = React.useState(false);

	const trigger = React.isValidElement(children)
		? React.cloneElement(
				children as React.ReactElement<{
					onClick?: (event: React.MouseEvent) => void;
					onSelect?: (event: Event) => void;
				}>,
				{
					onClick: (event: React.MouseEvent) => {
						children.props.onClick?.(event);
						if (event.defaultPrevented) {
							return;
						}
						setOpen(true);
					},
					onSelect: (event: Event) => {
						children.props.onSelect?.(event);
						if (event.defaultPrevented) {
							return;
						}
						event.preventDefault();
						setOpen(true);
					},
				},
			)
		: children;

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			{trigger}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{title ?? "Are you absolutely sure?"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{description ?? "This action cannot be undone."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={disabled}
						onClick={onClick}
						variant={type ?? "destructive"}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
