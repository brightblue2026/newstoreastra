---
name: admin-ux
description: UX patterns for the Bright Blue admin panel (products, variants, combos, offers, inventory, enquiries). Use when building or changing any screen, form, table, dialog or flow under /admin.
---

# Admin UX

The admin is a work tool for a small team, often the owner on a phone. Optimise for three things in this order: nothing wrong goes live (safety), frequent tasks are fast (speed), and every screen is obvious without training (clarity).

## Layout

- Left sidebar: Dashboard, Products, Combos, Offers, Brands, Categories, Inventory, Enquiries, Settings. Collapses to a drawer below 1024 px.
- Top bar: global search / command palette (Ctrl/Cmd+K) that jumps to any product, combo, offer or page and runs actions like "New product".
- Page header: title on the left, one primary action on the right ("New product"), secondary actions in a menu.
- Edit pages: sections with headings, a sticky save bar at the bottom showing unsaved state and "Save" / "Publish". On mobile the bar stays fixed at the bottom.
- Admin visuals stay quiet: brand navy for primary actions, neutral surfaces, the storefront's type family. Density over decoration.

## Forms

- Labels above inputs, helper text below, required fields marked.
- Validate on blur and on submit. Server errors map back to the exact field. Error text says what's wrong and how to fix it: "SKU MX3-LEM-500 is already used by MX-3 Lemon 500 ml", not "Invalid SKU".
- Currency inputs show a ₹ prefix, accept rupees, store paise. Show MRP and selling price side by side with the computed discount %.
- Autosave drafts; warn before leaving with unsaved changes; Ctrl/Cmd+S saves.
- Slugs auto-generate from the name and stay editable, with an inline availability check.
- Long option lists (fragrances, variants) use searchable comboboxes, not plain selects.
- Image upload: drop zone, multi-select, progress per file, drag to reorder, alt text inline, clear "Cover" marker.

## Variant matrix

- Inputs: attribute names and values as tag inputs (Fragrance: Lemon, Lavender, …; Size: 500 ml, 1 L, 5 L).
- "Generate" creates all combinations with auto SKUs; regenerating keeps existing rows' data.
- Grid with row checkboxes; a bulk bar appears when rows are selected: set price, set MRP, set stock, activate, deactivate.
- Keyboard-friendly cell editing (Tab / Enter move between cells).

## Tables

- Sticky header, right-aligned tabular numbers, status as a badge with text.
- Search, filters and sort are reflected in the URL so views can be shared and survive refresh.
- Row click opens the item; a row menu holds secondary actions.
- Selecting rows shows a bulk action bar with a count ("12 selected").
- Inline edit for price and stock: click, edit, Enter to save, Esc to cancel, with a saving indicator per cell.
- Low stock and unavailable combos are visibly flagged and filterable.
- Loading uses skeleton rows; empty state explains what goes here and offers the primary action.
- Below 768 px, rows become stacked cards showing the key fields.

## Feedback and safety

- Buttons keep the same verb through the flow: "Publish" → toast "Published". "Archive" → "Archived" with Undo.
- Optimistic updates for small edits, with rollback and an error toast if the server rejects.
- Destructive actions (delete, bulk archive) open a dialog that names the object and the consequence: "Delete 3 products? Their 41 variants and 2 combos using them will also be removed."
- Price changes, especially bulk ones, show a before/after preview and a count before confirming. Warn when a selling price or combo price falls below cost.
- Offers show a live "applies to" summary and warn about overlaps with existing offers.
- CSV import always runs a dry run with a row-by-row report before writing.
- Every write goes to the audit log; product and combo pages show a "History" panel.

## Copy

- Sentence case everywhere. Plain words from the user's world: "Stock", "Combo", "Offer", not "Inventory entity" or "Bundle SKU group".
- Empty states invite action: "No combos yet. Build one from your best-selling products."
- Errors don't apologise and are never vague.
- Indian formats: ₹ with en-IN grouping (₹1,25,000), dates as 17 Sep 2026.

## Accessibility

- Full keyboard navigation; dialogs trap focus and return it on close.
- Every input has a real label; icon-only buttons have accessible names.
- Toasts announce via `aria-live="polite"`.
- Visible `:focus-visible` rings.

## Components

Use what the repo already has. If nothing exists for a need, these fit well together: shadcn/ui primitives, TanStack Table for data tables, react-hook-form with zod for forms, dnd-kit for drag reordering, cmdk for the command palette, sonner for toasts. Confirm with the user before adding any dependency.
