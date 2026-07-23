/**
 * ComplianceFooter.tsx — trust + compliance strip for the billing page.
 * International SaaS billing best practice: renewal disclosure, VAT
 * transparency, policy links, and security badges all visible in one place.
 */

import { Link } from "react-router-dom";
import { ShieldCheck, Lock, FileText, RotateCcw, ScrollText } from "lucide-react";

export default function ComplianceFooter() {
  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary" />
          PCI-DSS compliant payments via Paystack
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-4 h-4 text-primary" />
          256-bit SSL encryption
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RotateCcw className="w-4 h-4 text-primary" />
          Cancel anytime, no lock-in
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Subscriptions renew automatically each month until cancelled. VAT is shown separately on every invoice.
        New paid subscriptions are covered by a 7-day money-back guarantee — after that, cancelling stops future
        renewals but does not refund the current billing period. Downloadable receipts are available for every payment above.
      </p>

      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 border-t border-border/60">
        <Link to="/terms" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5">
          <FileText className="w-3 h-3" /> Terms of Service
        </Link>
        <Link to="/privacy" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5">
          <ScrollText className="w-3 h-3" /> Privacy Policy
        </Link>
        <Link to="/terms#refunds" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5">
          <RotateCcw className="w-3 h-3" /> Cancellation & Refund Policy
        </Link>
      </div>
    </div>
  );
}