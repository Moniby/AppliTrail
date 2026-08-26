import AppliTrailLogo from "../applitrail-logo";

export const metadata = {
  title: "Browser Extension | AppliTrail",
  description: "Install the AppliTrail Job Importer for Chrome and Microsoft Edge.",
};

const steps = [
  ["Download the extension", "Save the AppliTrail ZIP package to your computer."],
  ["Unzip the package", "Open the downloaded file and extract it to a folder you will keep."],
  ["Open browser extensions", "In Chrome, visit chrome://extensions. In Edge, visit edge://extensions."],
  ["Enable Developer mode", "Turn on Developer mode using the switch on the extensions page."],
  ["Load AppliTrail", "Choose Load unpacked, then select the unzipped AppliTrail extension folder."],
  ["Pin and use it", "Pin the AppliTrail icon, open a job advertisement, then choose Capture & review in AppliTrail."],
] as const;

export default function ExtensionPage(){return <main className="extension-page">
  <nav className="extension-nav"><a className="landing-brand" href="/"><AppliTrailLogo />AppliTrail</a><div><a href="/">Home</a><a href="/app">Open dashboard</a></div></nav>
  <section className="extension-hero"><div><p className="eyebrow">BROWSER EXTENSION · BETA · VERSION 1.1.4</p><h1>Save a job ad without starting from scratch.</h1><p>Capture an open job posting, review every extracted detail, and save it to your own AppliTrail account when you are ready.</p><div className="extension-hero-actions"><a className="landing-primary" href="/applitrail-job-importer-v1.1.4.zip" download>Download for Chrome &amp; Edge</a><a href="#install">View installation steps</a></div><small>The beta uses your browser’s Developer mode. Already installed? Download version 1.1.4, replace the files in your extension folder, then select Reload on your browser’s extensions page.</small></div><aside><span>WHAT IT CAPTURES</span><ul><li>Company and job title</li><li>Job description and original link</li><li>Location and work arrangement where available</li><li>Position type and salary where published</li></ul><strong>You review everything before it is saved.</strong></aside></section>
  <section id="install" className="extension-install"><div className="extension-install-heading"><p className="eyebrow">INSTALLATION GUIDE</p><h2>Set it up in a few minutes.</h2><p>These instructions work for Google Chrome and Microsoft Edge on a computer.</p></div><ol>{steps.map(([title,detail],index)=><li key={title}><span>{String(index+1).padStart(2,"0")}</span><div><strong>{title}</strong><p>{detail}</p></div></li>)}</ol></section>
  <section className="extension-test"><div><p className="eyebrow">TEST THE EXTENSION</p><h2>Try your first import.</h2><p>Sign in to AppliTrail, open a public job advertisement in another tab, click the pinned AppliTrail icon, and select <strong>Capture &amp; review in AppliTrail</strong>. Correct anything incomplete before saving.</p></div><a href="/app">Open your dashboard</a></section>
  <section className="extension-privacy"><article><span>✓</span><div><h2>Runs only when you click it</h2><p>The extension reads the active job-ad tab only after you choose to capture it.</p></div></article><article><span>✓</span><div><h2>No automatic applications</h2><p>It does not submit applications, upload CVs or send information to an employer.</p></div></article><article><span>✓</span><div><h2>Your review is required</h2><p>Captured details open as a draft and follow your normal plan limits before saving.</p></div></article></section>
  <footer className="landing-footer"><span>© {new Date().getFullYear()} AppliTrail</span><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></footer>
 </main>}
