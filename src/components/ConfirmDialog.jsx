import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', destructive, onConfirm, onCancel, children }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
