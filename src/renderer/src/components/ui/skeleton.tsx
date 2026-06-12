import { cn } from '../../lib/utils'

const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element => {
  return <div className={cn('animate-pulse rounded-md bg-bg-elevated', className)} {...props} />
}

export { Skeleton }
