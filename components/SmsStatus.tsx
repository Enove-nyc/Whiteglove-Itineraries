import { smsConfigStatus } from "@/lib/sms";

// Can the site send a verification code by text?
//
// Reported on the server and answered plainly. The account SID and auth token
// are never sent to the browser — only whether each one is set — so nothing on
// this panel can leak a credential.

const code = "rounded bg-[var(--cream)] px-1 font-mono text-[12px]";

export default function SmsStatus() {
  const status = smsConfigStatus();

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Text messages</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Can people sign up with a phone number?</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
        Not everybody has an email they check. With a text service connected, somebody can sign up with their number
        instead and get the verification code by text. Until then the sign-up form asks for an email only — it never
        offers a choice it cannot honour.
      </p>

      <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Right now</dt>
          <dd className={status.configured ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>
            {status.configured ? "Sign-up by phone is on" : "Email only"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Texts come from</dt>
          <dd className="text-stone-700">{status.sender ?? "— not set —"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Account</dt>
          <dd className={status.accountSet ? "text-emerald-700" : "text-stone-500"}>
            {status.accountSet ? "TWILIO_ACCOUNT_SID is set" : "TWILIO_ACCOUNT_SID is missing"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Token</dt>
          <dd className={status.tokenSet ? "text-emerald-700" : "text-stone-500"}>
            {status.tokenSet ? "TWILIO_AUTH_TOKEN is set" : "TWILIO_AUTH_TOKEN is missing"}
          </dd>
        </div>
      </dl>

      {!status.configured && (
        <div className="mt-5 border-l-4 border-[var(--gold)] bg-white px-4 py-3 text-sm leading-6 text-stone-700">
          <strong>To switch it on:</strong> open a Twilio account, buy a number, then set{" "}
          <code className={code}>TWILIO_ACCOUNT_SID</code>, <code className={code}>TWILIO_AUTH_TOKEN</code> and{" "}
          <code className={code}>TWILIO_FROM_NUMBER</code> and redeploy.
          <p className="mt-2">
            Two things worth knowing before you do. Texting US numbers needs the number registered for A2P 10DLC first,
            which Twilio runs as an application and which takes days rather than minutes — until it clears, messages to
            US mobiles are rejected. And every text costs a fraction of a cent, so unlike email it is not free.
          </p>
          <p className="mt-2">
            Sent codes appear in the delivery list on this page alongside the emails, with whatever Twilio said when one
            fails.
          </p>
        </div>
      )}
    </section>
  );
}
