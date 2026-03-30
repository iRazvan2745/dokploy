'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';

type TabsVariant = 'default' | 'outline' | 'underline';

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn(
        'flex flex-col gap-4 data-[orientation=vertical]:flex-row',
        className
      )}
      data-slot="tabs"
      {...props}
    />
  );
}

function TabsList({
  variant = 'default',
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsVariant;
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        'relative z-0 flex w-fit items-center justify-center gap-x-0.5 text-card-foreground',
        'data-[orientation=vertical]:flex-col',
        variant === 'default'
          ? 'rounded-lg bg-muted/50 p-1 text-card-foreground/64'
          : 'border-b border-border data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:border-r',
        className
      )}
      data-slot="tabs-list"
      {...props}
    >
      {children}

      {/* The Magic Indicator */}
      <TabsPrimitive.Indicator
        className={cn(
          // 1. Fixed the syntax for Tailwind v3 variable interpolation
          'absolute top-0 left-0 transition-[width,height,transform] duration-300 ease-in-out',
          'h-[var(--active-tab-height)] w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] translate-y-[var(--active-tab-top)]',

          variant === 'underline'
            ? 'z-10 bg-primary data-[orientation=horizontal]:top-auto data-[orientation=horizontal]:bottom-0 data-[orientation=horizontal]:h-0.5'
            : 'z-0 rounded-md bg-background shadow-sm dark:bg-muted' // Changed -z-1 to z-0
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative z-10 flex flex-1 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent font-medium text-sm outline-none transition-colors disabled:pointer-events-none disabled:opacity-50",
        "text-muted-foreground hover:text-foreground aria-[selected=true]:text-foreground",
        "gap-1.5 px-3 py-1.5",
        "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start",
        className
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        'flex-1 outline-none',
        // Simple CSS fade-in animation when the panel enters
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-200',
        className
      )}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTab,
  TabsTab as TabsTrigger,
  TabsPanel,
  TabsPanel as TabsContent,
};
