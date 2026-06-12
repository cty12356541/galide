import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { cn } from '../../lib/utils'

const Command = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>): JSX.Element => (
  <CommandPrimitive
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-xl bg-surface text-text',
      className
    )}
    {...props}
  />
)

const CommandInput = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>): JSX.Element => (
  <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 text-text-muted" />
    <CommandPrimitive.Input
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none',
        'placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
)

const CommandList = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>): JSX.Element => (
  <CommandPrimitive.List
    className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
)

const CommandEmpty = (props: React.ComponentProps<typeof CommandPrimitive.Empty>): JSX.Element => (
  <CommandPrimitive.Empty className="py-6 text-center text-sm text-text-muted" {...props} />
)

const CommandGroup = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>): JSX.Element => (
  <CommandPrimitive.Group
    className={cn('overflow-hidden p-1 text-text', className)}
    {...props}
  />
)

const CommandItem = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>): JSX.Element => (
  <CommandPrimitive.Item
    className={cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none',
      'data-[selected=true]:bg-bg-elevated data-[selected=true]:text-text',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      className
    )}
    {...props}
  />
)

const CommandSeparator = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>): JSX.Element => (
  <CommandPrimitive.Separator className={cn('-mx-1 h-px bg-border', className)} {...props} />
)

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator
}
