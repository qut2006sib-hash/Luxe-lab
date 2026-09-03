# LUXE shared accounting core

This module is the common financial foundation for **LUXE Real Estate** and
**LUXE Lab**. It adopts the useful accounting concepts found in mature systems
such as Al-Bayan without copying proprietary code or coupling the ledger to a
specific business domain.

## Delivered in this foundation

- organization-scoped chart of accounts;
- customers, suppliers, and domain-linked parties;
- receivable and payable documents with immutable idempotency keys;
- draft-to-posted workflow with optimistic concurrency;
- incoming and outgoing payments with document allocations;
- double-entry journal entries generated in the same database transaction;
- fixed-point monetary arithmetic (minor units, never JavaScript floating
  point);
- organization currency enforcement until a reviewed foreign-exchange layer is
  added;
- audit-log records for setup, document creation/posting, and payments;
- owner/accountant write access with tenant isolation.

The default chart contains cash, accounts receivable, accounts payable, service
revenue, and operating expense accounts. It can be extended later without
changing the accounting contracts.

## Safety invariants

1. Every posted journal has equal non-zero debit and credit totals.
2. A journal line has a debit or a credit, never both.
3. Posted documents and payments are not deleted or silently edited.
4. A payment cannot exceed a document's remaining balance.
5. Domain adapters use both an idempotency key and a source reference.
6. All reads and writes are scoped to the current organization.
7. The first version accepts only the organization's base currency.

## Integration path

### LUXE Real Estate

The existing rent invoice tables remain untouched in this additive migration.
The next adapter will post rent invoices, maintenance expenses, sales receipts,
tenant balances, owner statements, and property/unit profitability into this
core. A reconciled cutover is required before the legacy billing tables become
read-only.

### LUXE Lab

The laboratory will be a separate application/domain. Its first workflow will
cover patients, test orders, result entry, validation, and release. When an
order is priced, the lab adapter creates a receivable document whose line items
are the requested tests; payment then uses the same shared ledger.

## Explicitly deferred

- foreign exchange gains/losses and exchange-rate tables;
- taxes, credit notes, and payment reversals;
- inventory, reagent lots, and expiry tracking;
- bank reconciliation and financial statements;
- migration of current real-estate invoices;
- laboratory patient/order/result tables and UI.

These are separate increments so the existing real-estate application can keep
running while each financial behavior is reconciled and tested.
