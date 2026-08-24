import { redirect } from "next/navigation";
import AppliTrailLogo from "../applitrail-logo";
import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const user = await getChatGPTUser();
  if (user) redirect("/app");

  const secureSignInPath = chatGPTSignInPath("/app");
  return <main className="signin-page">
    <section className="signin-card">
      <a className="landing-brand" href="/"><AppliTrailLogo />AppliTrail</a>
      <div className="signin-heading">
        <p className="eyebrow">WELCOME TO APPLITRAIL</p>
        <h1>Sign in to your career workspace.</h1>
        <p>Choose Google on the secure account screen, or continue with the email you already use for ChatGPT.</p>
      </div>
      <div className="signin-options">
        <a className="google-signin" href={secureSignInPath}>
          <span className="google-mark" aria-hidden="true">G</span>
          Continue with Google
        </a>
        <a className="chatgpt-signin" href={secureSignInPath}>
          <span aria-hidden="true">◎</span>
          Continue with ChatGPT or email
        </a>
      </div>
      <div className="signin-trust">
        <strong>One secure AppliTrail account</strong>
        <p>On this hosted version, Google sign-in is completed through the secure ChatGPT account gateway. Select <b>Continue with Google</b> on the next screen. AppliTrail never receives your Google password.</p>
      </div>
      <p className="signin-legal">By continuing, you can review and accept the <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Notice</a> before saving career information.</p>
    </section>
    <section className="signin-benefits">
      <p className="eyebrow">YOUR ACCOUNT TRAVELS WITH YOU</p>
      <h2>One private workspace across devices and countries.</h2>
      <ul>
        <li><span>✓</span><div><strong>Applications stay connected</strong><p>Return to every role, date, note and generated document.</p></div></li>
        <li><span>✓</span><div><strong>Your local checkout experience</strong><p>Stripe can present supported local currencies and payment options.</p></div></li>
        <li><span>✓</span><div><strong>Your data remains separated</strong><p>Every user sees only the career information stored in their account.</p></div></li>
      </ul>
      <a href="/">← Back to AppliTrail</a>
    </section>
  </main>;
}
