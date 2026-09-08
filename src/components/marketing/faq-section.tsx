import { FAQS } from "@/lib/marketing";
import { Reveal } from "@/components/motion/reveal";

/**
 * Native `<details>` rather than a scripted accordion.
 *
 * It is keyboard-operable and screen-reader-correct for free, it needs no
 * JavaScript, and — the reason that matters commercially — the answers are in
 * the DOM whether or not the panel is open, so a crawler or an AI assistant
 * can read them.
 */
export function FaqSection({
  heading = "Questions people ask before signing up",
  id = "faq",
}: {
  heading?: string;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-16" aria-labelledby={`${id}-heading`}>
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2
            id={`${id}-heading`}
            className="text-h1 font-semibold tracking-tight text-balance"
          >
            {heading}
          </h2>
        </Reveal>

        <div className="mt-6 divide-y rounded-xl border">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.question} delay={0.02 * i}>
              <details className="group px-4 py-3" name={id}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-small font-medium">
                  {faq.question}
                  <span
                    aria-hidden
                    className="text-muted-foreground shrink-0 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="text-muted-foreground mt-2 text-small">
                  {faq.answer}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
