import { Check, ChevronsUpDown, PlusIcon, Search, X } from "lucide-react";
import * as React from "react";
import { HandleTag } from "@/components/dashboard/settings/tags/handle-tag";
import { TagBadge } from "@/components/shared/tag-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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
	const [createTagOpen, setCreateTagOpen] = React.useState(false);
	const [query, setQuery] = React.useState("");

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
	const normalizedQuery = query.trim().toLowerCase();
	const filteredTags = tags.filter((tag) =>
		tag.name.toLowerCase().includes(normalizedQuery),
	);

	React.useEffect(() => {
		if (!open && query) {
			setQuery("");
		}
	}, [open, query]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<div className={cn("w-full", className)}>
					<Button
						type="button"
						variant="outline"
						aria-expanded={open}
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
				</div>
			</PopoverTrigger>

			<PopoverContent
				className="z-[10000] w-[var(--radix-popover-trigger-width)] p-0"
				align="start"
				sideOffset={8}
				collisionPadding={16}
			>
				<div className="p-2">
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

					<div className="mt-2 min-h-[140px] max-h-[240px] overflow-y-auto">
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
											<Checkbox checked={isSelected} className="mr-1 pointer-events-none" />
											<TagBadge name={tag.name} color={tag.color} className="mr-2" />
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
							<div className="flex min-h-[140px] flex-col items-center justify-center gap-2 py-4">
								<span className="text-sm text-muted-foreground">
									No tags found.
								</span>
								<Button
									type="button"
									onClick={() => {
										setOpen(false);
										setCreateTagOpen(true);
									}}
								>
									<PlusIcon className="h-4 w-4" />
									Create Tag
								</Button>
							</div>
						)}
					</div>
				</div>
			</PopoverContent>
			<HandleTag
				open={createTagOpen}
				hideTrigger
				onOpenChange={setCreateTagOpen}
			/>
		</Popover>
	);
}
