import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import * as React from "react";
import { HandleTag } from "@/components/dashboard/settings/tags/handle-tag";
import { TagBadge } from "@/components/shared/tag-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Tag {
	id: string;
	name: string;
	color?: string;
}

interface TagSelectorProps {
	tags: Tag[];
	selectedTags: string[];
	onTagsChange: (tagIds: string[]) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
}

export function TagSelector({
	tags,
	selectedTags,
	onTagsChange,
	placeholder = "Select tags...",
	className,
	disabled = false,
}: TagSelectorProps) {
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const containerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!open) return;

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (!containerRef.current?.contains(target)) {
				setOpen(false);
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [open]);

	const handleTagToggle = (tagId: string) => {
		if (selectedTags.includes(tagId)) {
			onTagsChange(selectedTags.filter((id) => id !== tagId));
		} else {
			onTagsChange([...selectedTags, tagId]);
		}
	};

	const handleTagRemove = (tagId: string, e?: React.MouseEvent) => {
		e?.stopPropagation();
		onTagsChange(selectedTags.filter((id) => id !== tagId));
	};

	const selectedTagObjects = tags.filter((tag) =>
		selectedTags.includes(tag.id),
	);
	const filteredTags = tags.filter((tag) =>
		tag.name.toLowerCase().includes(query.trim().toLowerCase()),
	);

	return (
		<div ref={containerRef} className={cn("relative w-full", className)}>
			<Button
				type="button"
				variant="outline"
				aria-expanded={open}
				onClick={() => !disabled && setOpen((current) => !current)}
				className={cn(
					"w-full justify-between min-h-10 h-auto bg-input",
					disabled && "cursor-not-allowed opacity-50",
				)}
				disabled={disabled}
			>
				<div className="flex flex-wrap gap-1 flex-1">
					{selectedTagObjects.length > 0 ? (
						selectedTagObjects.map((tag) => (
							<TagBadge
								key={tag.id}
								name={tag.name}
								color={tag.color}
								className="flex items-center gap-1 pr-1"
							>
								<button
									type="button"
									onClick={(e) => handleTagRemove(tag.id, e)}
									className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
									disabled={disabled}
								>
									<X className="h-3 w-3 hover:opacity-70" />
									<span className="sr-only">Remove {tag.name}</span>
								</button>
							</TagBadge>
						))
					) : (
						<span className="text-muted-foreground">{placeholder}</span>
					)}
				</div>
				<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
			</Button>

			{open && (
				<div className="absolute inset-x-0 top-full z-[80] mt-2 rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search tags..."
							className="pl-9"
							autoFocus
						/>
					</div>

					<div className="mt-2 max-h-[240px] overflow-y-auto">
						{filteredTags.length > 0 ? (
							<div className="space-y-1">
								{filteredTags.map((tag) => {
									const isSelected = selectedTags.includes(tag.id);
									return (
										<button
											key={tag.id}
											type="button"
											onClick={() => handleTagToggle(tag.id)}
											className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
										>
											<Checkbox
												checked={isSelected}
												className="pointer-events-none"
											/>
											<TagBadge
												name={tag.name}
												color={tag.color}
												className="mr-2"
											/>
											<Check
												className={cn(
													"ml-auto h-4 w-4",
													isSelected ? "opacity-100" : "opacity-0",
												)}
											/>
										</button>
									);
								})}
							</div>
						) : (
							<div className="flex flex-col items-center gap-2 py-4">
								<span className="text-sm text-muted-foreground">
									No tags found.
								</span>
								<HandleTag />
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
