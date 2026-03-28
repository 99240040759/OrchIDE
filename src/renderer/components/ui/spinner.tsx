import { Icon } from "@/components/ui/Icon"
import { cn } from "@/lib/utils"

interface SpinnerProps {
  size?: number;
  className?: string;
}

function Spinner({ size = 14, className }: SpinnerProps) {
  return (
    <Icon
      name="loading"
      size={size}
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", className)}
    />
  )
}

export { Spinner }
