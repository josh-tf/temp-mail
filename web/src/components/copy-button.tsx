import { useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function CopyButton({
  value,
  label = 'Copy',
  size = 'icon-sm',
  variant = 'ghost',
  children,
}: {
  value: string;
  label?: string;
  size?: 'icon-sm' | 'icon' | 'sm' | 'default';
  variant?: 'ghost' | 'outline' | 'secondary';
  children?: React.ReactNode;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  }
  const Icon = done ? CheckIcon : CopyIcon;
  const button = (
    <Button type="button" variant={variant} size={size} onClick={copy} aria-label={children ? undefined : label}>
      <Icon />
      {children}
    </Button>
  );
  if (children) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{done ? 'Copied' : label}</TooltipContent>
    </Tooltip>
  );
}
