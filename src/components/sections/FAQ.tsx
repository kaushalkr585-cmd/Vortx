// ============================================================
// VORTX — FAQ Section
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { FAQItem } from '../../types';

const FAQS: FAQItem[] = [
  {
    question: 'Is VORTX free to use?',
    answer:
      'Yes, VORTX is completely free with no hidden costs. You can download unlimited videos and audio without any account or subscription.',
  },
  {
    question: 'What video qualities are supported?',
    answer:
      'VORTX supports all available qualities from 144p to 4K Ultra HD (2160p), including HDR where available. The quality options shown depend on what the source platform provides.',
  },
  {
    question: 'Can I download Instagram Reels and YouTube Shorts?',
    answer:
      'Absolutely. VORTX fully supports Instagram Reels, Stories, Posts, YouTube Shorts, and regular YouTube videos. Simply paste the URL and select your preferred quality.',
  },
  {
    question: 'Does VORTX store my downloaded files?',
    answer:
      'No. Downloads are processed in real-time and streamed directly to your device. We do not store any files on our servers.',
  },
  {
    question: 'Can I download audio-only as MP3?',
    answer:
      'Yes. Switch to the Audio tab in the downloader and choose from 128 kbps, 192 kbps, 256 kbps, or 320 kbps MP3 formats.',
  },
  {
    question: 'Is there an API available?',
    answer:
      'Yes, VORTX offers a REST API for developers who want to integrate download functionality into their own applications. Check the API Documentation for endpoints, rate limits, and examples.',
  },
  {
    question: 'Is downloading copyrighted content legal?',
    answer:
      'You should only download content that you have permission to download. Downloading copyrighted material without authorization may violate platform terms of service and applicable law. VORTX is a tool; responsibility lies with the user.',
  },
];

type ItemProps = FAQItem & { index: number };

function FAQAccordionItem({ question, answer, index }: ItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="faq-item"
    >
      <button
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`faq-answer-${index}`}
        id={`faq-question-${index}`}
      >
        <span
          className="font-medium text-white"
          style={{ fontSize: '0.9375rem' }}
        >
          {question}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`faq-answer-${index}`}
            role="region"
            aria-labelledby={`faq-question-${index}`}
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p
              className="pb-5 text-sm leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.52)' }}
            >
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FAQ() {
  return (
    <section
      id="faq"
      className="relative z-10 px-4 sm:px-6 py-24"
      aria-label="Frequently asked questions"
    >
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-12"
        >
          <h2
            className="font-bold text-white"
            style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', letterSpacing: '-0.03em' }}
          >
            Common Questions
          </h2>
          <p className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Everything you need to know about VORTX.
          </p>
        </motion.div>

        <div className="flex flex-col">
          {FAQS.map((faq, i) => (
            <FAQAccordionItem key={i} {...faq} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
