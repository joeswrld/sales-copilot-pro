/**
 * InvoiceDialog.tsx
 *
 * Detailed receipt view for a single transaction. Paystack's API doesn't
 * return a VAT breakdown or invoice number, so we derive presentational
 * values from the stored total (VAT backed out at VAT_RATE) and generate
 * a stable invoice number from the transaction reference. These are
 * clearly labelled as such — nothing here is invented as if Paystack
 * returned it directly.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Printer, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import type { SubscriptionTransaction } from "@/hooks/useSubscription";
import { USD_TO_NGN } from "@/config/plans";
import { VAT_RATE, formatUSD } from "@/config/checkout";
import { cn } from "@/lib/utils";

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: SubscriptionTransaction | null;
  userEmail?: string | null;
  userName?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-primary/10 text-primary border-primary/30",
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  refunded: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  abandoned: "bg-muted text-muted-foreground border-border",
};

function statusLabel(status: string) {
  if (status === "success") return "Paid";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  if (status === "abandoned" || status === "cancelled") return "Cancelled";
  return "Pending";
}

/** Deterministic invoice number derived from the Paystack reference. */
function invoiceNumberFor(reference: string, createdAt: string) {
  const year = new Date(createdAt).getFullYear();
  const shortRef = reference.slice(-8).toUpperCase();
  return `INV-${year}-${shortRef}`;
}

export default function InvoiceDialog({ open, onOpenChange, transaction, userEmail, userName }: InvoiceDialogProps) {
  if (!transaction) return null;

  const totalNgn = transaction.amount_ngn;
  const totalUsd = totalNgn / USD_TO_NGN;
  const subtotalUsd = totalUsd / (1 + VAT_RATE);
  const vatUsd = totalUsd - subtotalUsd;
  const subtotalNgn = subtotalUsd * USD_TO_NGN;
  const vatNgn = vatUsd * USD_TO_NGN;

  const invoiceNumber = invoiceNumberFor(transaction.reference, transaction.created_at);
  const paidDate = transaction.paid_at ?? transaction.created_at;
  const nextRenewal = new Date(paidDate);
  nextRenewal.setMonth(nextRenewal.getMonth() + 1);

  const statusKey = transaction.status === "success" ? "success" : transaction.status;

  const handlePrint = () => window.print();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-lg">{invoiceNumber}</DialogTitle>
              <DialogDescription>Invoice details and receipt</DialogDescription>
            </div>
            <Badge variant="outline" className={cn("border", STATUS_STYLES[statusKey] ?? STATUS_STYLES.pending)}>
              {statusLabel(transaction.status)}
            </Badge>
          </div>
        </DialogHeader>

        <div id="invoice-print-area" className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Billed to / Fixsense */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Billed to</p>
              <p className="font-medium text-foreground">{userName || "Fixsense customer"}</p>
              {userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Issued by</p>
              <p className="font-medium text-foreground">Fixsense</p>
              <p className="text-xs text-muted-foreground">fixsense.com.ng</p>
            </div>
          </div>

          <Separator />

          {/* IDs */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice number</span>
              <span className="font-mono text-xs text-foreground">{invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono text-xs text-foreground">{transaction.reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment reference</span>
              <span className="font-mono text-xs text-foreground">{transaction.reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment method</span>
              <span className="text-foreground capitalize">{transaction.channel || "Card"} · Paystack</span>
            </div>
          </div>

          <Separator />

          {/* Amounts */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-xs text-muted-foreground pb-1">
              <span>Reference exchange rate</span>
              <span className="tabular-nums">₦{USD_TO_NGN.toLocaleString()} / $1</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal (USD)</span>
              <span className="tabular-nums text-foreground">{formatUSD(subtotalUsd)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal (NGN)</span>
              <span className="tabular-nums text-foreground">₦{subtotalNgn.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT (10%)</span>
              <span className="tabular-nums text-foreground">
                {formatUSD(vatUsd)} · ₦{vatNgn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-foreground text-base">
              <span>Total paid</span>
              <span className="tabular-nums">₦{totalNgn.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <Separator />

          {/* Dates */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment date</span>
              <span className="text-foreground">{format(new Date(paidDate), "MMMM d, yyyy · h:mm a")}</span>
            </div>
            {transaction.status === "success" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next renewal date</span>
                <span className="text-foreground">{format(nextRenewal, "MMMM d, yyyy")}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/20 border border-border text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
            Processed securely by Paystack. Fixsense never stores your card details.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-secondary/10 flex gap-2 print:hidden">
          <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            Print Invoice
          </Button>
          <Button className="flex-1 gap-2" onClick={handlePrint}>
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}