// Served by the service worker (public/sw.js) when a page isn't already saved
// on the phone and there's no connection to fetch it fresh. Static and tiny on
// purpose — it has to render from the cache with nothing else to fetch, the one
// moment guaranteed to have no network at all. Falling back to the homepage
// here (the old behaviour) read as "the app lost my trip"; this says plainly
// what happened and that saved pages are still there.
export const metadata = { title: "You're offline — White Glove", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f5f0", padding: "0 20px", fontFamily: "Inter,system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ font: "600 11px/1 Inter,sans-serif", letterSpacing: ".16em", textTransform: "uppercase", color: "#b1852f" }}>No connection</div>
        <h1 style={{ font: "400 26px/1.2 Georgia,'Times New Roman',serif", color: "#17293a", margin: 0 }}>You&rsquo;re offline</h1>
        <p style={{ font: "400 15px/1.6 Inter,sans-serif", color: "#5a544e", margin: 0 }}>
          This page hasn&rsquo;t been saved on your phone yet, so it needs a connection to load. Anything you already
          opened on this trip &mdash; today&rsquo;s plan, your hotel, your wallet &mdash; is still there if you go back to it.
        </p>
      </div>
    </main>
  );
}
