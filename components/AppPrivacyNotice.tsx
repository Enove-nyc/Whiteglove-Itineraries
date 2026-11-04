/** Factual app supplement, including when the main policy was edited in Admin. */
export default function AppPrivacyNotice() {
  return <section aria-labelledby="app-privacy" className="wg-prose mx-auto max-w-3xl px-5 py-10 sm:px-8">
    <h2 id="app-privacy" className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Travel app privacy</h2>
    <p className="mt-3 text-sm text-stone-500">Updated November 4, 2026</p>
    <h3 className="mt-6 text-xl font-semibold">Your personal travel wallet</h3>
    <p className="mt-3">Boarding passes, hotel confirmations and tickets added to the personal wallet are saved by the app on that device. They are not uploaded to our servers or shared with your travel group. The personal wallet does not provide cloud sync. Shared itinerary attachments are separate and keep their own access permissions.</p>
    <p className="mt-3">You can remove personal files from the wallet. Signing out clears the personal wallet in that app or browser on that device. Clearing app data or removing the app can also remove those files.</p>
    <h3 className="mt-6 text-xl font-semibold">Trip codes and group conversations</h3>
    <p className="mt-3">A valid trip code opens the shared itinerary and its group conversations. Keep the code private: anyone who has it can open the shared trip. Chat display names are chosen by travelers and are not verified identities.</p>
    <p className="mt-3">Group messages and display names are stored on our servers so the people on the trip can read them. A signed participant cookie remembers your chat identity on that device. Each trip channel keeps its latest 500 messages; conversations do not expire automatically when the travel dates end. Revoking a trip code closes access through that code.</p>
    <p className="mt-3">To request access to or deletion of your information, use the contact details in this privacy policy. Removing a personal wallet file is separate from removing a shared itinerary attachment or a group message.</p>
  </section>;
}
