import OfflineDocuments from "@/components/OfflineDocuments";
import { formatDateLong } from "@/data/itinerary";
import { KIND_LABELS, type AttachmentKind, describeSize } from "@/lib/attachments";
import { type TripDocument, documentSummary, documentsByDay, ownerWord } from "@/lib/trip-documents";

/**
 * Every pass and ticket on the trip, by the day it is needed.
 *
 * The planner keeps each one beside the thing it belongs to, which is right
 * while the trip is being built. This is the other shape: the morning of the
 * flight, on a phone, where the question is "give me the pass" and not "which
 * day did I put it on".
 *
 * A server component. The links are ordinary links to a route that checks who
 * is asking, so there is nothing for the browser to do until somebody taps.
 */
export default function TripDocuments({
  documents,
  today,
}: {
  documents: TripDocument[];
  /** YYYY-MM-DD, so the day they are on can be marked. */
  today?: string;
}) {
  const days = documentsByDay(documents);

  return (
    <section aria-labelledby="documents-heading">
      <h2 id="documents-heading" className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
        On your phone
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{documentSummary(documents)}</p>

      {/* Offered only where there is something to save. An offer over an empty
          list is a button that does nothing. */}
      {documents.length > 0 && <OfflineDocuments ids={documents.map((d) => d.attachment.id)} />}

      {days.length > 0 && (
        <div className="mt-6 space-y-6">
          {days.map((day) => (
            <div key={day.date ?? "no-day"}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
                {day.date ? formatDateLong(day.date) : "Not on a day yet"}
                {day.date && today && day.date === today ? " — today" : ""}
              </p>
              <ul className="mt-2 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
                {day.documents.map((document) => (
                  <li key={document.attachment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <a
                      href={`/api/account/attachments?id=${encodeURIComponent(document.attachment.id)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0"
                    >
                      <span className="block font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
                        <span aria-hidden="true">📎</span>{" "}
                        {KIND_LABELS[document.attachment.kind as AttachmentKind]?.label ?? "File"} — {document.attachment.name}
                      </span>
                      <span className="block text-sm text-stone-500">
                        {ownerWord(document.ownerKind)}: {document.belongsTo} · {describeSize(document.attachment.bytes)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
