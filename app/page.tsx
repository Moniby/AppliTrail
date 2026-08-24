import { getChatGPTUser } from "./chatgpt-auth";
import HowItWorksVideo from "./how-it-works-video";
import PublicPricing from "./public-pricing";

export const dynamic = "force-dynamic";

const frequentlyAskedQuestions = [
  {
    question: "What happens if my Basic or Standard subscription is not renewed?",
    answer: "Your applications are not deleted. You can continue viewing and updating every saved application, note, date and document. You cannot add another application until you renew a Basic or Standard subscription.",
  },
  {
    question: "Will cancelling my subscription delete my applications or Master CVs?",
    answer: "No. Cancellation stops the next renewal, but paid access continues until the end of the current billing term. After the term ends, your saved information remains in your account and new application creation is paused until renewal.",
  },
  {
    question: "Can a Free account buy extra AI credits?",
    answer: "No. Extra-credit purchases are available only to active Basic and Standard members. Free accounts receive two included AI generations each month.",
  },
  {
    question: "What counts as one AI generation?",
    answer: "A completed tailored CV, cover letter, phone-screen brief or interview-practice pack uses one generation. Extracting information from an uploaded CV does not use a generation, and a failed generation is not charged against your allowance.",
  },
  {
    question: "Do unused AI generations roll over?",
    answer: "Included monthly generations reset each month and do not roll over. Extra credits purchased by an active paid member do not expire and are used after the monthly allowance.",
  },
  {
    question: "How many applications and Master CVs can I keep?",
    answer: "Free includes up to 3 applications and 2 Master CVs. Basic includes up to 10 applications and 5 Master CVs. Standard includes unlimited application tracking and unlimited Master CVs.",
  },
  {
    question: "Can I use different Master CVs for different career paths?",
    answer: "Yes. You can maintain separate Master CVs for paths such as IT Support, Customer Support or Cloud and DevOps, then select the most relevant one when tailoring an application.",
  },
  {
    question: "Does AppliTrail invent experience to match a job description?",
    answer: "No. AppliTrail tailors and reorganizes supported evidence from your selected Master CV, highlights gaps and asks you to verify missing experience rather than presenting unverified claims as fact.",
  },
  {
    question: "Which features require a paid plan?",
    answer: "Basic and Standard include professional Word and PDF CV formats, reminders and calendar downloads, Excel application-list export, and the ability to purchase extra AI credits.",
  },
  {
    question: "How do quarterly, six-month and annual plans work?",
    answer: "The selected term is paid upfront and renews at the same frequency. Included AI generations still refresh monthly throughout the prepaid term. Longer terms include the saving shown on the pricing cards.",
  },
  {
    question: "Is my job-search information private?",
    answer: "Your applications, Master CVs, uploaded resumes and generated materials are separated by signed-in account. You can export your account data or request deletion from the Account page.",
  },
  {
    question: "Can I sign in with Google?",
    answer: "Yes. Choose Continue with Google on the AppliTrail sign-in page, then select Google on the secure account screen. On the current hosted version, Google identity is handled by the ChatGPT account gateway, so AppliTrail never receives your Google password.",
  },
  {
    question: "Can I pay from outside Canada or in my local currency?",
    answer: "Yes. Where Stripe supports local pricing, checkout will show and collect the equivalent amount in a supported local currency before payment. Taxes and available payment methods depend on your location.",
  },
] as const;

export default async function LandingPage() {
  const user = await getChatGPTUser();
  return <main className="landing-page">
    <nav className="landing-nav"><a className="landing-brand" href="/"><span>A</span>AppliTrail</a><div><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>{user?<a className="landing-signin" href="/app">Open dashboard</a>:<a className="landing-signin" href="/signin">Sign in</a>}</div></nav>
    <section className="landing-hero"><div><p className="eyebrow">YOUR PRIVATE APPLICATION STUDIO</p><h1>Move every job application forward with confidence.</h1><p>Track opportunities, tailor evidence-based CVs and cover letters, and prepare for recruiter calls and interviews—all in one secure workspace.</p><div className="landing-actions">{user?<a className="landing-primary" href="/app">Continue to your dashboard</a>:<a className="landing-primary" href="/signin">Create your AppliTrail account</a>}<HowItWorksVideo /></div><small>Google sign-in available. Start free with 2 AI generations each month.</small></div><aside className="landing-preview"><span>APPLICATION PIPELINE</span><strong>One place for every next step.</strong><div><i>01</i><p><b>Save the opportunity</b>Keep the role, company, dates and job description together.</p></div><div><i>02</i><p><b>Choose your Master CV</b>Use the right evidence profile for each application.</p></div><div><i>03</i><p><b>Prepare with AI</b>Create truthful tailored materials and interview preparation.</p></div><div><i>04</i><p><b>Track and Remind</b>Keep track of each application and set reminders when necessary.</p></div></aside></section>
    <section id="how-it-works" className="landing-features"><article><span>Private by design</span><h2>Your applications belong only to your account.</h2><p>Each user’s applications, Master CVs, generated materials and uploaded resumes are stored separately.</p></article><article><span>Built for evidence</span><h2>Tailoring that protects the truth.</h2><p>AppliTrail highlights supported experience, identifies gaps and asks for confirmation instead of inventing qualifications.</p></article><article><span>Ready for every stage</span><h2>From application to interview.</h2><p>Keep dates, time zones, phone briefs, interview practice and outcomes alongside the original job description.</p></article></section>
    <PublicPricing ctaHref={user ? "/app" : "/signin"} signedIn={Boolean(user)} />
    <section id="faq" className="landing-faq"><div className="landing-faq-heading"><p className="eyebrow">FREQUENTLY ASKED QUESTIONS</p><h2>Know exactly how AppliTrail works.</h2><p>Plans, credits, renewals and your saved job-search information—explained clearly.</p></div><div className="landing-faq-list">{frequentlyAskedQuestions.map((item)=><details key={item.question}><summary>{item.question}<span aria-hidden="true">＋</span></summary><p>{item.answer}</p></details>)}</div></section>
    <footer className="landing-footer"><span>© {new Date().getFullYear()} AppliTrail</span><div><a href="#faq">FAQ</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></footer>
  </main>;
}
