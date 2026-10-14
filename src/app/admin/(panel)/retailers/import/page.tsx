import Link from '@/components/Link';
import { MAX_IMPORT_ROWS, RETAILER_CSV_HEADER } from '@/lib/retailer';
import { requireCatalogueAccess } from '@/lib/session';
import { importRetailersAction } from '../actions';
import { ImportForm } from './import-form';

export default async function ImportRetailersPage() {
  await requireCatalogueAccess();

  return (
    <div>
      <Link href="/admin/retailers" className="type-caption text-ink-soft underline">
        All retailers
      </Link>
      <h1 className="mt-4 type-display-sm">Import retailers</h1>

      <div className="mt-8 max-w-2xl space-y-4 type-body text-ink-soft">
        <p>
          Save the retailer sheet as a CSV file. The first row must name the columns, in any
          order:
        </p>
        <p className="overflow-x-auto rounded-control border border-line bg-white px-4 py-3 type-mono text-ink">
          {RETAILER_CSV_HEADER}
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Phone is optional. Every other column must be filled in for every shop.</li>
          <li>
            A shop already on the site with the same name and pincode is updated, not added
            twice. Uploading the same sheet again changes nothing.
          </li>
          <li>Shops that are not in the file are left exactly as they are.</li>
          <li>
            If any row has a problem, nothing is imported, and every row to fix is listed by its
            row number in the sheet.
          </li>
          <li>Up to {MAX_IMPORT_ROWS.toLocaleString('en-IN')} shops per file.</li>
        </ul>
      </div>

      <ImportForm action={importRetailersAction} />
    </div>
  );
}
