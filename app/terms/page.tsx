export const metadata = { title: "Terms | AppliTrail" };

export default function TermsPage() {
  return <main className="legal-page">
    <a className="legal-brand" href="/">← AppliTrail</a>
    <article>
      <p className="eyebrow">TERMS OF USE</p>
      <h1>Use AppliTrail as a preparation assistant.</h1>
      <p>AppliTrail is a product of Tompris Technologies Inc. These terms govern your use of the AppliTrail website, account workspace and browser extension.</p>
      <p>AppliTrail helps users organize applications and prepare career materials. It does not guarantee interviews, offers, employment outcomes or acceptance by an applicant-tracking system.</p>

      <h2>Accurate information</h2>
      <p>You are responsible for ensuring that your profile, CVs, extracted fields and generated materials are truthful and accurate. Review every extraction and generated document before using or saving it.</p>

      <h2>Plans and AI credits</h2>
      <p>Free, Basic and Standard plans include the monthly AI generation allowance displayed at checkout. The Free plan can track up to 3 applications and hold up to 2 Master CVs. Basic can track up to 10 applications and hold up to 5 Master CVs. Standard includes unlimited application tracking and unlimited Master CVs. If a plan change leaves an account above a new limit, existing records remain available to edit or delete, but the user cannot add more of that resource until the account is below the limit or upgraded.</p>
      <p>Successful tailored CV, cover-letter, phone-brief and interview-practice generations use one credit. Failed attempts and Master CV extraction do not use a user credit. Monthly-plan included credits reset each month and do not roll over. On Quarterly, six-month and Annual plans, unused included credits roll over during the paid billing term. A successful renewal carries the remaining included balance into the renewed term with a new expiry date; without renewal, that balance expires at term end. Separately purchased credits remain stored until used but require an active paid plan.</p>

      <h2>Prepaid subscriptions and currencies</h2>
      <p>Quarterly, six-month and annual plans are billed upfront for the full selected term. Unless cancellation is scheduled, the subscription renews for the same term at the price presented before checkout. Cancellation keeps paid access active until the end of the current term. AppliTrail’s catalog is priced in Canadian dollars. Stripe may present and collect a converted amount in a supported local currency; the checkout page shows the currency, exchange-adjusted total, applicable taxes and available payment methods before confirmation. Subscriptions and purchases for AppliTrail are offered by Tompris Technologies Inc. and processed securely by Stripe.</p>

      <h2>Sandbox checkout</h2>
      <p>While Stripe checkout is marked as test mode, test payment details may be entered but no real card is charged. Test receipts and balances are stored so the feature can be verified, but they are not proof of payment and have no cash value. Live billing terms, refunds, taxes and payment-provider details will be presented before real payments are enabled.</p>

      <h2>Acceptable use</h2>
      <p>Limits, features and availability may change. Automated abuse, account sharing and attempts to bypass limits are prohibited. The administrator may suspend access to protect the service and can reactivate an account after review.</p>

      <h2>Your content</h2>
      <p>You retain responsibility for the career information you upload. You grant AppliTrail permission to process it only as needed to provide the features you request.</p>
      <p>You may attach a PDF or Word copy of the CV and cover letter used for an application. These files and generated-document snapshots are retained with that application until you remove them, delete the application or delete your account. Uploading or attaching a document does not use an AI credit.</p>

      <h2>Availability</h2>
      <p>The service may occasionally be unavailable or return incomplete results. Calendar files and in-app reminders are planning aids; verify deadlines and scheduled times independently.</p>
      <p className="legal-updated">Effective September 8, 2026 · AppliTrail is a product of Tompris Technologies Inc.</p>
    </article>
  </main>;
}
