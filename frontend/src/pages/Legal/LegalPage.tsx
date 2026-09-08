import { Link } from "react-router-dom";

type LegalPageKind = "privacy" | "terms";

interface LegalSection {
  readonly title: string;
  readonly body: readonly string[];
}

interface LegalContent {
  readonly title: string;
  readonly subtitle: string;
  readonly effectiveDate: string;
  readonly sections: readonly LegalSection[];
}

const privacyContent: LegalContent = {
  title: "Privacy Policy",
  subtitle:
    "This policy explains how TasteMatcher handles account, catalog, preference, communication, and Google user data.",
  effectiveDate: "September 8, 2026",
  sections: [
    {
      title: "Who We Are",
      body: [
        "TasteMatcher is an art advisory and gallery workflow application used to manage artwork catalogs, customer preferences, recommendations, proposals, and related communications.",
        "For privacy questions or data requests, contact admin@tastematcher.com.",
      ],
    },
    {
      title: "Information We Collect",
      body: [
        "We collect account information such as name, email address, role, domain or gallery association, login verification activity, and account status.",
        "We collect content that users add to the product, including artwork images, artwork metadata, catalog details, customer onboarding responses, preference signals, proposal comments, and sales workflow activity.",
        "When a user connects Google or Gmail for the auction PDF intake feature, we access only the Gmail data needed to identify allowlisted auction PDF emails, download the relevant PDF attachments, generate an import JSON file, reply to the original thread, and label processed messages.",
      ],
    },
    {
      title: "How We Use Information",
      body: [
        "We use information to provide the TasteMatcher product, authenticate users, display catalogs, process artwork uploads, generate recommendations, manage buying proposals, send product emails, and support customer and gallery workflows.",
        "Gmail data is used only for the user-facing auction PDF intake workflow: reading matching emails from configured allowlisted senders, processing auction or price-list PDF attachments into TasteMatcher import files, sending those import files back to the email thread, and marking messages as processed.",
        "We do not use Google user data for advertising, retargeting, credit decisions, data brokerage, or unrelated analytics.",
      ],
    },
    {
      title: "Google User Data",
      body: [
        "TasteMatcher requests the minimum Gmail permissions needed for the auction PDF intake feature. The current workflow uses Gmail access to search for matching messages, read selected PDF attachments, send replies with generated JSON attachments, and apply a processed label.",
        "Google user data is not sold. Google user data is not transferred to third parties except as necessary to provide the user-facing feature, comply with law, protect the service, or act with the user's consent.",
        "Generated import files may contain artwork information extracted from PDFs and embedded artwork images. They are sent back to the original Gmail thread so the user or an allowlisted partner can manually upload and review them in TasteMatcher.",
      ],
    },
    {
      title: "Storage And Retention",
      body: [
        "TasteMatcher stores account, catalog, preference, proposal, and operational data for as long as needed to provide the service, meet business requirements, resolve disputes, and comply with legal obligations.",
        "Temporary files created by local automation, such as downloaded auction PDFs and generated import JSON files, are stored on the user's configured machine or execution environment and should be removed when no longer needed.",
        "OAuth tokens used for Gmail automation are stored outside the repository by the user or deployment operator and should be protected as credentials.",
      ],
    },
    {
      title: "Security",
      body: [
        "We use role-based access controls, authenticated API access, secure transport, and cloud storage controls to protect product data.",
        "Users and operators are responsible for protecting local OAuth tokens, client secrets, exported import files, and any downloaded PDF attachments.",
      ],
    },
    {
      title: "Your Choices",
      body: [
        "Users may request access, correction, deletion, or export of their data by contacting admin@tastematcher.com.",
        "Users may revoke Google access from their Google Account security settings or by removing the local Gmail OAuth token used by the automation.",
      ],
    },
    {
      title: "Changes",
      body: [
        "We may update this policy as the product changes. If our use of Google user data changes materially, we will update this policy and request any required user consent before using Google user data for the new purpose.",
      ],
    },
  ],
};

const termsContent: LegalContent = {
  title: "Terms of Service",
  subtitle:
    "These terms describe the rules for using TasteMatcher and its catalog, recommendation, proposal, upload, and automation features.",
  effectiveDate: "September 8, 2026",
  sections: [
    {
      title: "Use Of The Service",
      body: [
        "TasteMatcher provides software for art catalog management, customer preference collection, artwork recommendations, buying proposals, uploads, automatic upload previews, and related gallery workflows.",
        "You may use TasteMatcher only in compliance with applicable laws, these terms, and any written agreement that applies to your organization.",
      ],
    },
    {
      title: "Accounts And Authorization",
      body: [
        "You are responsible for maintaining the security of your account, login access, and any credentials used with connected services.",
        "If you connect Gmail or another Google service, you authorize TasteMatcher or its configured automation to perform the disclosed actions needed for the connected feature.",
      ],
    },
    {
      title: "User Content",
      body: [
        "You retain ownership of artwork images, catalog metadata, customer responses, proposal information, PDF files, generated import files, and other content you provide.",
        "You grant TasteMatcher the rights needed to host, process, transform, display, transmit, and store your content for the purpose of operating and improving the service.",
      ],
    },
    {
      title: "Automated PDF Intake",
      body: [
        "The auction PDF intake feature may read allowlisted Gmail messages, process PDF attachments, generate import JSON files, reply to the original email thread, and label processed messages.",
        "Generated import files are intended for manual review before upload. TasteMatcher does not guarantee that PDF parsing will be complete or error-free, especially when PDF structures vary.",
        "You are responsible for reviewing imported artwork data, prices, dates, images, and attribution before approving any upload or customer-facing use.",
      ],
    },
    {
      title: "Acceptable Use",
      body: [
        "You must not use TasteMatcher to upload unlawful content, violate intellectual property rights, bypass access controls, interfere with the service, or process data you are not authorized to use.",
        "You must not use connected Google data for surveillance, advertising, resale, credit decisions, or purposes unrelated to the disclosed TasteMatcher feature.",
      ],
    },
    {
      title: "Third-Party Services",
      body: [
        "TasteMatcher may integrate with third-party services such as Google, Gmail, Azure, storage providers, and email providers. Your use of those services may also be governed by their own terms and policies.",
      ],
    },
    {
      title: "Disclaimers",
      body: [
        "TasteMatcher is provided on an as-is and as-available basis. We do not promise uninterrupted service, perfect recommendations, complete parsing accuracy, or error-free generated data.",
        "Artwork recommendations, extracted PDF data, and generated import files are workflow aids and do not replace professional review or business judgment.",
      ],
    },
    {
      title: "Contact",
      body: [
        "For questions about these terms, contact admin@tastematcher.com.",
      ],
    },
  ],
};

const contentByKind: Record<LegalPageKind, LegalContent> = {
  privacy: privacyContent,
  terms: termsContent,
};

export function LegalPage({ kind }: { readonly kind: LegalPageKind }) {
  const content = contentByKind[kind];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="inline-flex text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          Back to TasteMatcher
        </Link>

        <header className="mt-8 border-b border-gray-200 pb-8">
          <p className="text-sm font-semibold text-blue-700">TasteMatcher</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal text-gray-950 sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-600">
            {content.subtitle}
          </p>
          <p className="mt-4 text-sm text-gray-500">
            Effective date: {content.effectiveDate}
          </p>
        </header>

        <div className="space-y-8 py-8">
          {content.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-gray-950">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700 sm:text-base">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="border-t border-gray-200 py-6 text-sm text-gray-500">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>TasteMatcher</span>
            <nav className="flex gap-4" aria-label="Legal links">
              <Link className="hover:text-gray-900" to="/privacy-policy">
                Privacy Policy
              </Link>
              <Link className="hover:text-gray-900" to="/terms-of-service">
                Terms of Service
              </Link>
            </nav>
          </div>
        </footer>
      </article>
    </main>
  );
}
