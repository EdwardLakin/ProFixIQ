import { LEGAL_CONTACT, LEGAL_DOCUMENTS, type LegalDocument } from "./config";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocumentContent = {
  document: LegalDocument;
  summary: string;
  sections: LegalSection[];
};

const serviceProviders = [
  "Supabase — authentication, database and file storage",
  "Vercel — application hosting, content delivery and operational logs",
  "Stripe — subscriptions and payment processing",
  "Twilio SendGrid — transactional and service email",
  "OpenAI — optional AI-assisted features when a user invokes them",
  "Intuit QuickBooks — optional accounting integration enabled by a shop",
];

export const LEGAL_CONTENT: Record<string, LegalDocumentContent> = {
  terms: {
    document: LEGAL_DOCUMENTS.terms,
    summary:
      "The proposed business-to-business agreement between ProFixIQ and a repair shop, fleet or property-service organization using the platform.",
    sections: [
      {
        heading: "1. Agreement and contracting party",
        paragraphs: [
          `These draft Terms of Service (the “Terms”) govern access to ProFixIQ by the organization accepting them (“Customer”). The proposed service provider is ${LEGAL_CONTACT.operatingName}, based in ${LEGAL_CONTACT.jurisdiction}. Counsel must confirm the exact registered legal entity and complete service address before these Terms become effective.`,
          "The person accepting these Terms confirms that they have authority to bind the Customer. Staff users access ProFixIQ under the Customer’s account and instructions.",
        ],
      },
      {
        heading: "2. Service and licence",
        paragraphs: [
          "ProFixIQ provides hosted software for repair-shop, fleet and property-service operations, including work orders, maintenance requests, inspections, recommendations, approvals, parts, workforce workflows, portals, communications, invoicing, integrations and optional AI assistance.",
          "During an active subscription, ProFixIQ grants the Customer a limited, non-exclusive, non-transferable right to use the service for its internal business operations. Use is subject to these Terms, the applicable order and the Acceptable Use Policy, which is incorporated into these Terms. No ownership in the platform, source code or ProFixIQ branding is transferred.",
        ],
      },
      {
        heading: "3. Accounts and authorized users",
        bullets: [
          "The Customer must provide accurate account information and keep credentials confidential.",
          "The Customer controls its staff roles, invitations and use of customer or fleet portals.",
          "The Customer is responsible for activity performed through accounts it authorizes, except to the extent caused by ProFixIQ’s breach of its obligations.",
          "Suspected unauthorized access must be reported promptly to the support contact below.",
        ],
      },
      {
        heading: "4. Customer responsibilities",
        paragraphs: [
          "The Customer—not ProFixIQ—is the repair facility, service provider, employer, fleet operator or seller of record. The Customer remains responsible for estimates, repair authorizations, workmanship, parts, warranties, employee obligations, taxes, licensing and compliance with laws applying to its business.",
          "The Customer must have lawful authority to upload and use personal information, vehicle records, images, documents and communications in ProFixIQ, and must configure shop-specific customer terms reviewed for each jurisdiction in which it operates.",
        ],
      },
      {
        heading: "5. Customer data",
        paragraphs: [
          "As between the parties, the Customer retains its rights in data submitted to the service. The Customer authorizes ProFixIQ and its subprocessors to host, copy, transmit, back up and otherwise process that data only as needed to provide, secure, support and improve the contracted service, comply with law and prevent abuse.",
          "The Data Processing Addendum is incorporated into these Terms where ProFixIQ processes personal information for the Customer.",
        ],
      },
      {
        heading: "6. AI-assisted features",
        paragraphs: [
          "AI output may be incomplete or incorrect and is provided as decision support. It is not a diagnosis, repair instruction, safety certification, legal opinion or substitute for qualified professional judgment. Users must review AI-generated suggestions before acting on them.",
          "ProFixIQ will not intentionally use Customer data to train a third party’s general-purpose model unless that use is separately disclosed and lawfully authorized.",
        ],
      },
      {
        heading: "7. Fees, trials, renewal and taxes",
        bullets: [
          "The order page or checkout controls the plan, price, currency, billing interval, included usage and trial period.",
          "Paid subscriptions renew for the displayed billing interval until cancelled, unless the order states otherwise.",
          "The Customer authorizes Stripe to charge the payment method for fees and applicable taxes.",
          "Cancellation takes effect at the end of the current paid period unless the order or applicable law requires another result.",
          "Fees are non-refundable and not prorated except where the order, a written commitment or applicable law says otherwise.",
          "A material price change will be communicated before the next affected renewal.",
        ],
      },
      {
        heading: "8. Availability, support and changes",
        paragraphs: [
          "ProFixIQ will use commercially reasonable efforts to operate the service, but no uninterrupted-availability commitment applies unless stated in a signed service-level agreement. Maintenance, security incidents, internet providers and third-party services may affect availability.",
          "ProFixIQ may update the service. It will not materially reduce core paid functionality during a subscription term without reasonable notice, except where required for security, law or third-party platform changes.",
        ],
      },
      {
        heading: "9. Suspension and termination",
        paragraphs: [
          "ProFixIQ may suspend access reasonably necessary to address a security risk, unlawful use, material breach or overdue undisputed fees, and will provide notice where practicable. Either party may terminate for an uncured material breach after reasonable written notice.",
          "After cancellation, the Customer should export required records during the available export period. Deletion and backup handling follow the Retention Notice and Data Processing Addendum.",
        ],
      },
      {
        heading: "10. Confidentiality and security",
        paragraphs: [
          "Each party will protect the other party’s non-public business information using reasonable care and use it only for the relationship. ProFixIQ will maintain reasonable administrative, technical and organizational safeguards appropriate to the service and information processed.",
        ],
      },
      {
        heading: "11. Warranties and disclaimers",
        paragraphs: [
          "Each party warrants that it has authority to enter this agreement. Except for express commitments in these Terms, the service is provided on an “as available” basis to the maximum extent permitted by law. ProFixIQ does not warrant repair outcomes, regulatory compliance by a Customer, AI accuracy or uninterrupted operation.",
          "Nothing in these Terms excludes a warranty, remedy or statutory right that cannot legally be excluded.",
        ],
      },
      {
        heading: "12. Liability",
        paragraphs: [
          "Subject to counsel review and non-waivable law, neither party will be liable for indirect, incidental, special or consequential loss, lost profits or lost business arising from the service. The proposed aggregate liability cap is the fees paid or payable for the service during the 12 months before the event giving rise to the claim.",
          "The exclusions and cap should not apply to fraud, wilful misconduct, breach of confidentiality, infringement indemnities, payment obligations or liability that cannot legally be limited. Counsel must confirm the final allocation and insurance alignment.",
        ],
      },
      {
        heading: "13. Governing law and disputes",
        paragraphs: [
          "The proposed governing law is Alberta and applicable federal Canadian law, and the proposed courts are located in Alberta. The parties should first attempt good-faith resolution through written notice. These business Terms do not waive non-excludable consumer rights and do not impose mandatory arbitration on a consumer.",
        ],
      },
      {
        heading: "14. Contact and changes",
        paragraphs: [
          `Legal and service notices may be sent to ${LEGAL_CONTACT.supportEmail}. Material changes will be identified by a new version and, where required, presented for renewed acceptance.`,
        ],
      },
    ],
  },
  privacy: {
    document: LEGAL_DOCUMENTS.privacy,
    summary:
      "How ProFixIQ proposes to collect, use, disclose, retain and protect personal information for its Canadian launch.",
    sections: [
      {
        heading: "1. Scope and privacy roles",
        paragraphs: [
          `${LEGAL_CONTACT.operatingName} is accountable for personal information it controls, such as account, subscription, support, security and website information. For customer, vehicle, employee, work-order, property, tenant and portal records entered by a shop, fleet or property organization, that organization generally determines the purposes and ProFixIQ processes the information as its service provider.`,
          "This distinction affects which organization answers a request. ProFixIQ will route a request to the relevant customer organization where appropriate.",
        ],
      },
      {
        heading: "2. Information collected",
        bullets: [
          "Account and identity information, including name, business email, username, role, shop or fleet association and authentication events.",
          "Customer and contact information, including name, email, telephone number, communication preferences and portal membership.",
          "Vehicle and asset information, including VIN, licence plate, unit number, mileage, service history, images and documents.",
          "Property-service information, including portfolio, property, unit, asset, occupant/contact, access-note, inspection and maintenance-request records.",
          "Operational records, including concerns, inspections, recommendations, quotes, approvals, work orders, parts, technician activity and invoices.",
          "Subscription and payment status received from Stripe; ProFixIQ does not intend to store complete payment-card numbers.",
          "Messages, support requests, email delivery events and records of consent or legal acceptance.",
          "Technical information such as IP-derived security signals, device/browser details, session cookies, timestamps, error logs and feature activity.",
          "Content submitted to optional AI features, together with the resulting output and safety/audit metadata.",
        ],
      },
      {
        heading: "3. Purposes",
        bullets: [
          "Create and secure accounts; authenticate users; enforce shop, fleet, property and role boundaries.",
          "Deliver work-order, maintenance-request, inspection, quote, approval, payment, portal, workforce and reporting functions.",
          "Send invitations, receipts, status updates, security notices and requested support communications.",
          "Administer subscriptions, reconcile payments and prevent fraud or abuse.",
          "Troubleshoot, measure reliability, maintain audit evidence and improve the contracted service.",
          "Provide optional integrations or AI assistance requested by an authorized user.",
          "Meet legal obligations and establish, exercise or defend legal claims.",
          "Send marketing only where permitted and with the required consent or other lawful basis.",
        ],
      },
      {
        heading: "4. Consent and choices",
        paragraphs: [
          "ProFixIQ will identify material purposes at or before collection and seek a form of consent appropriate to the information and context. Uses not necessary to deliver the service—such as optional marketing or non-essential tracking—must be presented separately.",
          "Consent may be withdrawn subject to legal or contractual restrictions. Withdrawal may prevent a requested feature from operating, but will not affect processing already lawfully completed.",
        ],
      },
      {
        heading: "5. Disclosures and subprocessors",
        paragraphs: [
          "Information may be disclosed to the Customer organization that manages the account, authorized portal participants, professional advisers, authorities where legally required, a successor in a lawful business transaction, and service providers acting under contract.",
        ],
        bullets: serviceProviders,
      },
      {
        heading: "6. Processing outside Canada",
        paragraphs: [
          "Some providers may process or support information outside Canada, including in the United States. Information in another country may be accessible to courts, law enforcement and national-security authorities under that country’s laws. Before launch, ProFixIQ must verify each provider’s contracted processing region and publish accurate transfer details in the Subprocessor List.",
          `Questions about foreign processing may be directed to ${LEGAL_CONTACT.privacyOfficer} at ${LEGAL_CONTACT.supportEmail}.`,
        ],
      },
      {
        heading: "7. Retention and deletion",
        paragraphs: [
          "Personal information will be retained only as long as reasonably required for the stated purposes, contractual obligations, security, backup recovery and legal requirements. The proposed schedules and unresolved implementation checks are described in the Retention Notice.",
          "Deletion is not absolute where records must be retained for billing, tax, dispute, fraud-prevention, consent or other legal purposes. Remaining data will be restricted to those purposes.",
        ],
      },
      {
        heading: "8. Safeguards and incidents",
        paragraphs: [
          "ProFixIQ uses role and tenant scoping, authentication, encryption in transit, provider access controls, audit records, backups and operational monitoring appropriate to the service. No system can guarantee absolute security.",
          "ProFixIQ will assess suspected breaches and provide legally required notices to affected organizations, individuals and privacy regulators. Customers must promptly report suspected unauthorized access involving their account.",
        ],
      },
      {
        heading: "9. Access, correction and complaints",
        paragraphs: [
          `A person may request access to or correction of personal information controlled by ProFixIQ, subject to lawful exceptions, by contacting ${LEGAL_CONTACT.supportEmail}. Identity will be verified before responding. Requests about customer-controlled service or property records may be referred to that organization.`,
          `Privacy questions or complaints should be addressed to ${LEGAL_CONTACT.privacyOfficer}. A person may also contact the applicable privacy commissioner.`,
        ],
      },
      {
        heading: "10. Account capacity and workforce users",
        paragraphs: [
          "ProFixIQ is a business operations service and is not offered to children as a consumer service. A subscription owner or administrator must have legal capacity and authority to bind the organization. If an organization authorizes a youth workforce account, the organization remains responsible for lawful employment, supervision and privacy notices appropriate to that user.",
        ],
      },
      {
        heading: "11. Changes",
        paragraphs: [
          "Material changes will receive a new version and prominent notice. New purposes or disclosures requiring consent will not take effect for affected information until the required consent is obtained.",
        ],
      },
    ],
  },
  "data-processing-addendum": {
    document: LEGAL_DOCUMENTS.dpa,
    summary:
      "Proposed processing terms for customer, employee, vehicle, repair and property-service data handled for a subscribing organization.",
    sections: [
      {
        heading: "1. Application and roles",
        paragraphs: [
          "This Data Processing Addendum forms part of the Terms of Service. It applies when ProFixIQ processes personal information on behalf of a Customer. The Customer is the organization controlling that information and ProFixIQ is its service provider or processor, except where ProFixIQ independently controls account, billing, security or legal-compliance information.",
        ],
      },
      {
        heading: "2. Processing instructions",
        paragraphs: [
          "ProFixIQ will process Customer personal information only on documented instructions in the agreement, product configuration and authorized use of the service, unless law requires otherwise. ProFixIQ will notify the Customer if an instruction appears unlawful, unless prohibited from doing so.",
        ],
      },
      {
        heading: "3. Processing details",
        bullets: [
          "Subject matter: hosted repair-shop, fleet, property-service, workforce, portal, communications and billing operations.",
          "Duration: the subscription plus the documented export, deletion and backup period.",
          "People: Customer staff, customers, fleet contacts, property occupants or contacts, vendors and other people represented in Customer records.",
          "Data: identity, contact, employment, vehicle, repair, property, maintenance, access-note, image, communication, invoice, payment-status and usage information.",
          "Purposes: providing, securing, supporting and maintaining the service and authorized integrations.",
        ],
      },
      {
        heading: "4. Confidentiality and security",
        paragraphs: [
          "ProFixIQ will limit access to personnel and contractors who need it and are bound by confidentiality obligations. It will maintain reasonable safeguards appropriate to the sensitivity and risk, including access control, tenant isolation, secure development, logging, backup and incident-response measures.",
        ],
      },
      {
        heading: "5. Subprocessors and transfers",
        paragraphs: [
          "The Customer authorizes the subprocessors in the published list. ProFixIQ will impose data-protection obligations appropriate to each service, remain responsible for its contractual duties and provide notice before adding a material subprocessor where reasonably practicable.",
          "Cross-border processing will be disclosed and protected through contractual and technical measures appropriate to applicable Canadian privacy law. Counsel must confirm whether additional provincial, state or international transfer terms are required for the Customer’s markets.",
        ],
      },
      {
        heading: "6. Individual requests",
        paragraphs: [
          "Taking account of the nature of processing, ProFixIQ will provide reasonable assistance so the Customer can respond to access, correction, portability, objection, consent-withdrawal or deletion requests. ProFixIQ will not respond for the Customer unless authorized or legally required.",
        ],
      },
      {
        heading: "7. Security incidents",
        paragraphs: [
          "ProFixIQ will notify the Customer without undue delay after confirming a security incident affecting Customer personal information, provide information reasonably available for assessment and notices, take reasonable containment and remediation steps, and cooperate with the Customer’s response.",
          "Notification is not an admission of fault. The Customer remains responsible for notices required because of its own systems, users, instructions or legal role.",
        ],
      },
      {
        heading: "8. Return, deletion and audit information",
        paragraphs: [
          "On termination, ProFixIQ will make reasonable export functionality available and then delete or de-identify Customer personal information according to the Retention Notice, except for backups and records lawfully retained under restricted access.",
          "On reasonable request, ProFixIQ will provide information needed to demonstrate these commitments. Any expanded audit must protect other customers, security and confidential information and avoid unreasonable disruption.",
        ],
      },
      {
        heading: "9. Precedence and contact",
        paragraphs: [
          `This Addendum controls over conflicting Terms only for its subject matter. Privacy and processing questions may be sent to ${LEGAL_CONTACT.supportEmail}.`,
        ],
      },
    ],
  },
  "acceptable-use": {
    document: LEGAL_DOCUMENTS.acceptableUse,
    summary:
      "Rules designed to protect customers, portal users and the reliability of ProFixIQ.",
    sections: [
      {
        heading: "Permitted use",
        paragraphs: [
          "ProFixIQ may be used only for lawful business operations by authorized users and in accordance with the Terms, documentation, account permissions and applicable law.",
        ],
      },
      {
        heading: "Prohibited conduct",
        bullets: [
          "Accessing another shop, fleet, user or customer’s information without authorization.",
          "Bypassing authentication, role checks, rate limits, security controls or payment restrictions.",
          "Uploading malware, unlawfully obtained information or content that infringes another person’s rights.",
          "Using the service for harassment, discrimination, deception, fraud or unlawful surveillance.",
          "Sending unsolicited commercial messages or communications without required consent and sender information.",
          "Reverse engineering or automated extraction except to the extent expressly permitted by law or a written agreement.",
          "Using AI output without qualified review where safety, repair quality, employment, credit or legal rights may be affected.",
          "Overloading, probing or interfering with the service or another user’s use.",
        ],
      },
      {
        heading: "Enforcement",
        paragraphs: [
          "ProFixIQ may investigate credible violations and apply proportionate restrictions needed to protect the service, users or law. Where practicable, the Customer will receive notice and an opportunity to correct the issue. Serious or repeated violations may result in suspension or termination.",
        ],
      },
      {
        heading: "Reporting",
        paragraphs: [
          `Report abuse or a suspected security issue to ${LEGAL_CONTACT.supportEmail} with “Security” or “Abuse” in the subject line. Do not include passwords or secret keys.`,
        ],
      },
    ],
  },
  cookies: {
    document: LEGAL_DOCUMENTS.cookies,
    summary:
      "The current proposed notice for authentication, security and preference storage used by ProFixIQ.",
    sections: [
      {
        heading: "Current use",
        paragraphs: [
          "The reviewed application currently relies on cookies or similar browser storage needed for authentication, session refresh, security controls, theme preferences, OAuth connection state and reliable offline operation. These are used to provide requested functionality rather than cross-site advertising.",
        ],
      },
      {
        heading: "Categories",
        bullets: [
          "Strictly necessary: sign-in sessions, account routing, security verification and load-balancing or hosting functions.",
          "Preferences: theme and interface choices saved in the browser.",
          "Functional storage: queued offline work and temporary workflow state needed to complete requested actions.",
          "Analytics or advertising: no non-essential third-party tracker was confirmed in the reviewed launch code. This must be re-audited before launch and whenever a tracker is added.",
        ],
      },
      {
        heading: "Choices",
        paragraphs: [
          "A browser can block or delete storage, but strictly necessary features may then fail. ProFixIQ must obtain the consent required by the user’s jurisdiction before loading any future non-essential analytics, behavioural advertising or comparable tracking technology.",
        ],
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          `This notice will be updated when storage practices change. Questions may be sent to ${LEGAL_CONTACT.supportEmail}.`,
        ],
      },
    ],
  },
  "portal-terms": {
    document: LEGAL_DOCUMENTS.portalTerms,
    summary:
      "Terms for invited customer, fleet and property users who view records, request service or make decisions through an organization’s portal.",
    sections: [
      {
        heading: "1. Portal relationship",
        paragraphs: [
          "A repair shop, fleet administrator or property organization invites and controls portal access. That organization—not ProFixIQ—is responsible for repairs, estimates, parts, workmanship, property services, schedules, warranties and customer service. ProFixIQ supplies the technology used to exchange information and record decisions.",
        ],
      },
      {
        heading: "2. Account authority",
        bullets: [
          "Use only an invitation addressed to you and provide accurate account information.",
          "Keep credentials private and report suspected unauthorized use.",
          "Confirm that you are authorized to view the vehicle, fleet or account records connected to the invitation.",
          "A fleet user confirms that the fleet has authorized the user’s assigned role.",
          "A property user confirms that the property organization has authorized the user’s assigned portfolio, property or unit access.",
        ],
      },
      {
        heading: "3. Requests, quotes and approvals",
        paragraphs: [
          "A service request is not a confirmed appointment unless the shop confirms it. Quote approval is an electronic authorization for the identified shop to perform the selected work at the displayed amount, subject to the separate Repair Authorization Terms shown at the approval point.",
          "Declined or deferred items are not authorized. Supplemental or materially changed work requires a new approval where required by the shop or applicable law.",
        ],
      },
      {
        heading: "4. Payments and records",
        paragraphs: [
          "Payments may be processed by Stripe for the shop. The shop is the seller or service provider and is responsible for refunds, disputes and invoices except where the portal expressly states otherwise. Electronic copies of approvals, invoices and receipts may be retained as business records.",
        ],
      },
      {
        heading: "5. Communications",
        paragraphs: [
          "Operational messages may include invitations, approvals, appointment updates, status notices, invoices and security alerts. Marketing messages require the consent or other authority required by applicable law and must include the required identification and unsubscribe method.",
        ],
      },
      {
        heading: "6. Privacy, availability and rights",
        paragraphs: [
          "The Privacy Policy explains ProFixIQ’s role. The inviting shop or fleet may have an additional privacy notice. Portal availability is not guaranteed, and urgent repair or safety matters should be handled directly with the shop.",
          "Nothing in these terms waives a consumer right or remedy that cannot legally be waived.",
        ],
      },
      {
        heading: "7. Contact",
        paragraphs: [
          `Contact the inviting shop about repairs or account records. Contact ${LEGAL_CONTACT.supportEmail} about portal access or ProFixIQ privacy and security concerns.`,
        ],
      },
    ],
  },
  "repair-authorization": {
    document: LEGAL_DOCUMENTS.repairAuthorization,
    summary:
      "The proposed electronic authorization language displayed when a customer approves quoted repair work.",
    sections: [
      {
        heading: "Authorization",
        paragraphs: [
          "By selecting Approve and confirming the authorization checkbox, the customer authorizes the identified repair shop to perform only the selected work for the displayed decision total, including the displayed parts, labour, fees and taxes. The customer confirms that they are the vehicle owner or are authorized to approve work for the owner or fleet.",
        ],
      },
      {
        heading: "Scope and changes",
        bullets: [
          "Each approved line is a separate authorization; declined or deferred lines are not authorized.",
          "The shop must obtain a new or supplemental authorization before materially exceeding the approved scope or amount, subject to applicable estimate and consumer-protection law.",
          "Discovery of additional conditions does not itself authorize additional work.",
          "The customer may contact the shop before work starts to ask whether an authorization can be changed; completed or committed work may still be payable where permitted by law.",
        ],
      },
      {
        heading: "Shop responsibility",
        paragraphs: [
          "The shop is responsible for the estimate, diagnosis, repair, parts, workmanship, timing, warranties, storage or diagnostic fees and required local disclosures. ProFixIQ records and transmits the decision but does not perform or warrant the repair.",
        ],
      },
      {
        heading: "Electronic record",
        paragraphs: [
          "The customer agrees that the checked confirmation, authenticated account, selected quote version, amounts, timestamp and document version may serve as an electronic record of authorization. A copy should remain available in the portal or be provided by the shop.",
        ],
      },
      {
        heading: "Statutory rights",
        paragraphs: [
          "This authorization does not waive non-excludable rights under consumer-protection, repair, sale-of-goods or other applicable law. Shop-specific terms may supplement this language but should not conflict with the displayed quote or applicable law.",
        ],
      },
    ],
  },
  retention: {
    document: LEGAL_DOCUMENTS.retention,
    summary:
      "Proposed retention targets that must be matched to production deletion, backup and export procedures before becoming effective.",
    sections: [
      {
        heading: "Principle",
        paragraphs: [
          "ProFixIQ will retain personal information only as long as reasonably required for the purpose collected, contractual service, security, legal obligations and dispute handling. These targets are drafts; engineering and counsel must verify that production jobs, backups and vendor settings match them before publication as effective commitments.",
        ],
      },
      {
        heading: "Proposed schedule",
        bullets: [
          "Active account and operational data: while the subscription or portal relationship remains active.",
          "Customer export window after account closure: proposed 30 days, unless a written order states another period.",
          "Primary-system deletion after the export window: proposed within 30 additional days, subject to legal holds and retained business records.",
          "Encrypted backups: age out under the provider rotation schedule, proposed not to exceed 90 days after primary deletion.",
          "Invoices, payment events, contractual acceptances and repair-authorization evidence: proposed seven years, subject to applicable tax, limitation and records law.",
          "Security and authentication logs: proposed 12 months unless needed for an active investigation.",
          "Support communications: proposed 24 months after closure of the request.",
          "Unfinished imports, temporary uploads and abandoned drafts: proposed 90 days where they are not attached to a required business record.",
          "Marketing consent and suppression records: as long as needed to demonstrate consent and honour do-not-contact choices.",
        ],
      },
      {
        heading: "Deletion and de-identification",
        paragraphs: [
          "At the end of a retention period, information will be deleted, securely overwritten through provider lifecycle controls, or irreversibly de-identified. Data under a legal hold will be restricted and retained until the hold ends.",
        ],
      },
      {
        heading: "Account closure and requests",
        paragraphs: [
          `An authorized account owner may request export or closure through support. Individual privacy requests may be sent to ${LEGAL_CONTACT.supportEmail}. Identity and authority will be verified, and shop-controlled requests may be referred to the relevant shop.`,
        ],
      },
    ],
  },
  subprocessors: {
    document: LEGAL_DOCUMENTS.subprocessors,
    summary:
      "Proposed providers involved in delivering ProFixIQ; processing regions and contract details require final verification.",
    sections: [
      {
        heading: "Current proposed list",
        bullets: serviceProviders,
      },
      {
        heading: "Purpose and limits",
        paragraphs: [
          "Each provider should receive only the information reasonably required for its function. Optional providers such as OpenAI and QuickBooks should receive data only when an authorized user invokes or enables the relevant feature.",
          "Stripe processes payment information under its own merchant and privacy terms. ProFixIQ intends to store identifiers, payment status and reconciliation records rather than full card numbers.",
        ],
      },
      {
        heading: "Processing locations",
        paragraphs: [
          "Provider processing and support may occur outside Canada, including in the United States. Before this list becomes effective, ProFixIQ must verify the Supabase project region, Vercel region/log settings, SendGrid account configuration, OpenAI data controls, Stripe merchant configuration and each provider’s current contractual entity.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "ProFixIQ will update this list before adding a material subprocessor where reasonably practicable. Customers may raise a documented data-protection concern through the support contact; the parties will work in good faith on a reasonable solution.",
        ],
      },
    ],
  },
  support: {
    document: LEGAL_DOCUMENTS.support,
    summary:
      "Proposed contacts and baseline rules for support, subscription cancellation, security reports and privacy requests.",
    sections: [
      {
        heading: "Support",
        paragraphs: [
          `Contact ${LEGAL_CONTACT.supportEmail} for account, billing or product support. Include the shop name, affected workflow and approximate time of the issue, but never send passwords, secret keys or complete payment-card details.`,
          "No guaranteed response or resolution time applies unless included in a signed order or service-level agreement. ProFixIQ should publish staffed support hours and target response times before unrestricted public launch.",
        ],
      },
      {
        heading: "Cancellation and refunds",
        paragraphs: [
          "An authorized subscription administrator may cancel through available billing controls or support. The proposed default is cancellation at the end of the current paid billing period. Refunds and credits are governed by the order, Terms and non-waivable law; the proposed default is no prorated refund for unused time.",
          "Counsel and the Stripe production configuration must confirm that checkout, receipts, billing-portal language and this policy state the same renewal and cancellation rules.",
        ],
      },
      {
        heading: "Security reports",
        paragraphs: [
          `Send suspected vulnerabilities or unauthorized access reports to ${LEGAL_CONTACT.supportEmail} with “Security” in the subject line. Provide enough detail to reproduce the concern without accessing another customer’s data, disrupting production or disclosing the issue publicly before there has been a reasonable opportunity to respond.`,
        ],
      },
      {
        heading: "Privacy requests",
        paragraphs: [
          `Address privacy requests to ${LEGAL_CONTACT.privacyOfficer} at ${LEGAL_CONTACT.supportEmail} with “Privacy request” in the subject line. ProFixIQ will verify identity and may direct shop-controlled record requests to the relevant shop or fleet.`,
        ],
      },
      {
        heading: "Required pre-launch confirmations",
        bullets: [
          "Exact legal entity name, complete mailing/service address and authorized signing officer.",
          "Staffed support hours, response targets and escalation owner.",
          "Stripe trial, renewal, cancellation and refund configuration matches the published wording.",
          "A monitored privacy/security contact and documented incident-response procedure exist.",
        ],
      },
    ],
  },
};

export function getLegalContent(slug: string): LegalDocumentContent | null {
  return LEGAL_CONTENT[slug] ?? null;
}
