import { Icon } from "@/components/icons/Icon";
import type { OpenStatus } from "@/lib/share-opens";

/**
 * WHETHER THE TRAVELLER HAS OPENED THIS LINK, said in one line.
 *
 * THE WORDS CARRY THE MEANING, NOT THE COLOUR. "Not opened yet" and "Last
 * opened today at 9:42 AM" are already unambiguous read aloud, in greyscale,
 * or by somebody who cannot tell the tones apart. The icon and the tone are
 * reinforcement — remove both and nothing is lost. That is the test this
 * component is built to pass.
 *
 * IT IS DELIBERATELY SMALL. Two dates is the whole of what is known, so this
 * is a line of text beside a link and never a panel, a chart, or a reason to
 * build a dashboard.
 */
export function ShareOpenStatus({ status, className = "" }: { status: OpenStatus; className?: string }) {
  const icon = status.state === "opened" ? "eye" : status.state === "revoked" ? "eye-off" : "dot";
  const tone =
    status.state === "opened" ? "text-[var(--navy)]" : status.state === "revoked" ? "text-stone-400" : "text-stone-500";
  return (
    <p className={`flex flex-wrap items-center gap-1.5 text-[11px] leading-4 ${tone} ${className}`}>
      <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">{status.text}</span>
      {status.detail && <span className="text-stone-500">· {status.detail}</span>}
    </p>
  );
}
