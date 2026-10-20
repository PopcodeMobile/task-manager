import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './utils';
export const Sheet = DialogPrimitive.Root;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
/** shadcn Sheet composition: Radix modal focus trap, portal, overlay, escape and restoration. */
export function SheetContent({ children, className, closeLabel, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { closeLabel: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content className={cn('ui-sheet', className)} {...props}>
        {children}
        <DialogPrimitive.Close className="sheet-close ui-button ui-button-ghost" aria-label={closeLabel}>
          <X size={18} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
