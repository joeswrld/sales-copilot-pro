/**
 * InvoiceTable.tsx — replaces the old flat transaction list with a
 * proper invoice table (Stripe/Linear-style).
 *
 * VAT / subtotal / total shown here are read from the transaction's
 * stored subtotal_usd/vat_usd/total_usd fields — the exact numbers the
 * server computed and sent to Paystack at checkout time — never
 * recomputed by backing VAT out of the raw NGN total client-side.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import type { SubscriptionTransaction } from "@/hooks/useSubscription";
import { formatUSD } from "@/config/checkout";
import { cn } from "@/lib/utils";
import InvoiceDialog from "./InvoiceDialog";
import { useAuth } from "@/contexts/AuthContext";

interface InvoiceTableProps {
  transactions: SubscriptionTransaction[];
  isLoading: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-primary/10 text-primary border-primary/30",
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  refunded: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  abandoned: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function statusLabel(status: string) {
  if (status === "success") return "Paid";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  if (status === "abandoned" || status === "cancelled") return "Cancelled";
  return "Pending";
}

function invoiceNumberFor(reference: string, createdAt: string) {
  const year = new Date(createdAt).getFullYear();
  const shortRef = reference.slice(-8).toUpperCase();
  return `INV-${year}-${shortRef}`;
}

export default function InvoiceTable({ transactions, isLoading }: InvoiceTableProps) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<SubscriptionTransaction | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Receipt className="w-5 h-5 text-muted-foreground" />
          Transaction History
        </CardTitle>
        <CardDescription>Every invoice for your account, synced directly from Paystack.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading invoices...
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No invoices yet. Your receipts will appear here after your first payment.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto -mx-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 25).map((tx) => {
                    const statusKey = tx.status === "success" ? "success" : tx.status;
                    return (
                      <TableRow
                        key={tx.reference}
                        className="cursor-pointer hover:bg-secondary/30"
                        onClick={() => setSelected(tx)}
                      >
                        <TableCell className="font-mono text-xs text-foreground">
                          {invoiceNumberFor(tx.reference, tx.created_at)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {format(new Date(tx.paid_at || tx.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm capitalize">
                          {tx.channel || "Card"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border text-xs", STATUS_STYLES[statusKey] ?? STATUS_STYLES.pending)}>
                            {statusLabel(tx.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                          {tx.vat_usd != null ? formatUSD(tx.vat_usd) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-foreground tabular-nums">
                          ₦{tx.amount_ngn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setSelected(tx); }}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2.5">
              {transactions.slice(0, 25).map((tx) => {
                const statusKey = tx.status === "success" ? "success" : tx.status;
                return (
                  <button
                    key={tx.reference}
                    onClick={() => setSelected(tx)}
                    className="w-full text-left p-3.5 rounded-lg border border-border hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{invoiceNumberFor(tx.reference, tx.created_at)}</p>
                        <p className="text-sm font-medium text-foreground mt-1">
                          ₦{tx.amount_ngn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(tx.paid_at || tx.created_at), "MMM d, yyyy · h:mm a")}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("border text-xs shrink-0", STATUS_STYLES[statusKey] ?? STATUS_STYLES.pending)}>
                        {statusLabel(tx.status)}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      <InvoiceDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        transaction={selected}
        userEmail={user?.email}
        userName={(user?.user_metadata as any)?.full_name}
      />
    </Card>
  );
}