import { createFileRoute, Link } from "@tanstack/react-router";

import { MARKETING_PLAN_TIERS, type MarketingPlanData } from "@hypr/pricing";
import { PlanFeatureList } from "@hypr/pricing/ui";
import { cn } from "@hypr/utils";

import { SiteFooter } from "@/components/site-footer";
import {
  ANARLOG_SITE_URL,
  getBreadcrumbListJsonLd,
  getSoftwareApplicationJsonLd,
  getStructuredDataGraph,
} from "@/lib/seo";

const PRICING_FAQS = [
  {
    question: "What does on-device transcription mean?",
    answer:
      "The Free plan includes on-device transcription on supported Macs. Pro can also use Anarlog-hosted cloud transcription when you want managed services instead.",
  },
  {
    question: "What is local-first data architecture?",
    answer:
      "Your data is filesystem-based by default: notes and transcripts are saved on your device first, and you stay in control of where files live.",
  },
  {
    question: "What is BYOK (Bring Your Own Key)?",
    answer:
      "BYOK allows you to connect your own LLM provider (like OpenAI, Anthropic, or self-hosted models) for AI features while maintaining full control over your data.",
  },
  {
    question: "What value does an account unlock?",
    answer:
      "A paid plan unlocks Anarlog's cloud layer: hosted transcription, speaker identification, language models, integrations, sync, and shareable links.",
  },
  {
    question: "What's included in shareable links?",
    answer:
      "Pro users get DocSend-like controls: track who views your notes, set expiration dates, and revoke access anytime.",
  },
  {
    question: "What are templates?",
    answer:
      "Templates are our opinionated way to structure summaries. You can pick from a variety of templates we provide and create your own version as needed.",
  },
  {
    question: "What are custom instructions?",
    answer:
      "Custom instructions let you override Anarlog's default system prompt by configuring template variables and the overall instructions given to the AI.",
  },
  {
    question: "What are shortcuts?",
    answer:
      'Shortcuts are saved prompts you use repeatedly, like "Write a follow-up to blog blah" or "Create a one-pager of the important stuff that\'s been discussed." They\'re available in chat via the / command.',
  },
  {
    question: "Do you offer student discounts?",
    answer:
      "Yes, we provide student discounts. Contact us and we'll help you get set up with student pricing.",
  },
] as const;

const pricingDescription =
  "Compare Anarlog Free and Pro. Start with local meeting notes for free, then upgrade to the single $8/month Pro plan for managed cloud features.";

export const Route = createFileRoute("/_view/pricing")({
  component: Component,
  head: () => {
    const url = `${ANARLOG_SITE_URL}/pricing`;

    return {
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            getStructuredDataGraph([
              getSoftwareApplicationJsonLd({
                url,
                description: pricingDescription,
                aggregateOffer: {
                  lowPrice: 0,
                  highPrice: 8,
                  offerCount: MARKETING_PLAN_TIERS.length,
                },
              }),
              {
                "@type": "FAQPage",
                mainEntity: PRICING_FAQS.map((faq) => ({
                  "@type": "Question",
                  name: faq.question,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: faq.answer,
                  },
                })),
              },
              getBreadcrumbListJsonLd([
                { name: "Home", item: ANARLOG_SITE_URL },
                { name: "Pricing", item: url },
              ]),
            ]),
          ),
        },
      ],
      meta: [
        { title: "Pricing - Anarlog" },
        {
          name: "description",
          content: pricingDescription,
        },
        { property: "og:title", content: "Pricing - Anarlog" },
        {
          property: "og:description",
          content: pricingDescription,
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
      ],
    };
  },
});

function Component() {
  return (
    <main className="text-color min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[700px] px-5 py-8 md:px-8 md:py-12">
        <header className="flex items-center justify-between gap-6">
          <Link to="/" aria-label="Anarlog home">
            <img src="/logo.svg" alt="Anarlog" className="h-9 w-auto" />
          </Link>
        </header>
        <HeroSection />
        <PricingCardsSection />
        <FAQSection />
      </div>

      <SiteFooter />
    </main>
  );
}

function HeroSection() {
  return (
    <section className="flex flex-col gap-7 pt-24 pb-12 text-left md:pt-32">
      <div className="flex flex-col gap-5">
        <h1 className="font-hand text-6xl leading-[0.98] font-semibold tracking-normal text-balance md:text-8xl">
          Pricing
        </h1>
        <p className="text-color-muted max-w-2xl text-xl leading-9">
          Start free with local meeting notes. Upgrade to Pro when you want
          hosted transcription, hosted AI models, sync, integrations, and
          sharing.
        </p>
      </div>
      <SunsetBanner />
    </section>
  );
}

function SunsetBanner() {
  return (
    <aside className="surface-subtle border-color-subtle rounded-lg border p-5">
      <p className="text-color-secondary font-mono text-xs tracking-normal uppercase">
        Pricing update
      </p>
      <p className="text-color-muted mt-2 text-sm leading-6">
        On July 3, 2026, Anarlog moves to one paid plan: Pro for $8/month.
        Legacy annual Pro subscriptions stay grandfathered until renewal.
      </p>
    </aside>
  );
}

function PricingCardsSection() {
  return (
    <section className="border-color-subtle border-t py-10">
      <div className="grid grid-cols-1 items-stretch gap-4">
        {MARKETING_PLAN_TIERS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function PricingCard({ plan }: { plan: MarketingPlanData }) {
  return (
    <article
      className={cn([
        "surface flex flex-col rounded-lg border p-6",
        plan.popular ? "border-color-bright shadow-sm" : "border-color-subtle",
      ])}
    >
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-color font-mono text-2xl">{plan.name}</h2>
          {plan.popular && (
            <span className="bg-brand-dark rounded-full px-3 py-1 font-mono text-xs text-white">
              $8/mo
            </span>
          )}
        </div>
        <p className="text-color-muted text-sm leading-6">{plan.description}</p>

        <div>
          {plan.price ? (
            <div className="flex items-baseline gap-2">
              <span className="text-color font-mono text-4xl font-medium">
                ${plan.price.monthly}
              </span>
              <span className="text-color-muted text-sm">/month</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-color font-mono text-4xl font-medium">
                $0
              </span>
              <span className="text-color-muted text-sm">/month</span>
            </div>
          )}
        </div>
      </div>

      <PlanFeatureList features={plan.features} />

      <div className="mt-auto pt-8">
        <Link
          to="/download/"
          className={cn([
            "flex h-11 w-full items-center justify-center rounded-full px-4 text-sm font-medium transition-all hover:scale-[102%] active:scale-[98%]",
            plan.popular
              ? "bg-linear-to-t from-stone-600 to-stone-500 text-white shadow-md hover:shadow-lg"
              : "border-color-subtle text-color border bg-white shadow-xs hover:bg-stone-50 hover:shadow-md",
          ])}
        >
          {plan.price ? "Download and upgrade in desktop" : "Download for free"}
        </Link>
      </div>
    </article>
  );
}

function FAQSection() {
  return (
    <section className="border-color-subtle border-t py-10">
      <h2 className="font-hand text-color-secondary text-3xl leading-none font-semibold tracking-normal">
        Frequently asked questions
      </h2>
      <div className="mt-7 grid gap-6">
        {PRICING_FAQS.map((faq) => (
          <div key={faq.question} className="border-color-subtle border-b pb-6">
            <h3 className="text-color text-base font-medium">{faq.question}</h3>
            <p className="text-color-muted mt-2 text-sm leading-6">
              {faq.answer}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
