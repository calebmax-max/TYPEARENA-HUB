const siteName = 'TYPEARENA HUB'
const defaultDescription = 'TYPEARENA HUB provides reliable typing, document formatting, CV, online application, presentation, design and data support services in Kenya.'

const servicePages = {
  'typing-formatting': {
    name: 'Typing and document formatting',
    title: 'Typing & Document Formatting Services in Kenya | TYPEARENA HUB',
    description: 'Get clean, accurate typing, document formatting, editing, PDF editing and file conversion services online in Kenya.',
    intro: 'Clean, accurate documents prepared for work, school, applications and everyday business tasks.',
    items: ['Typing and retyping', 'Document formatting', 'CV and resume formatting', 'PDF editing', 'Document conversion'],
    price: 'From KSh 15 per page',
  },
  cv: {
    name: 'CV writing and redesign',
    title: 'CV Writing and Redesign Services in Kenya | TYPEARENA HUB',
    description: 'Create a clear, professional CV or resume with TYPEARENA HUB. Get CV writing, editing, formatting and redesign support in Kenya.',
    intro: 'Make your experience easier to understand with a polished CV designed for the opportunity you are pursuing.',
    items: ['CV creation', 'CV editing and rewriting', 'Professional formatting', 'Cover letters', 'PDF and Word delivery'],
    price: 'From KSh 200',
  },
  applications: {
    name: 'Online application assistance',
    title: 'Online Application Assistance in Kenya | TYPEARENA HUB',
    description: 'Get careful help with online applications, registration forms, form filling and legitimate digital submissions in Kenya.',
    intro: 'Get practical help completing online applications and forms accurately, with you in control of your information.',
    items: ['Online applications', 'Registration forms', 'Form filling', 'Application guidance', 'Online account assistance'],
    price: 'From KSh 30 per form',
  },
  presentations: {
    name: 'Presentation and graphic design',
    title: 'Presentation and Graphic Design Services in Kenya | TYPEARENA HUB',
    description: 'Get PowerPoint presentations, posters, flyers, social media designs and practical graphic design support online in Kenya.',
    intro: 'Turn your information into clear, presentable slides and visual materials that are ready to share.',
    items: ['PowerPoint presentations', 'Posters and flyers', 'Graphic design', 'Social media designs', 'CV design'],
    price: 'From KSh 150',
  },
  'data-entry': {
    name: 'Data entry and administrative support',
    title: 'Data Entry Services in Kenya | TYPEARENA HUB',
    description: 'Get accurate data entry, spreadsheet, research formatting, report formatting and digital administrative support in Kenya.',
    intro: 'Hand over repetitive digital tasks and receive organized, accurate work prepared around your instructions.',
    items: ['Data entry', 'Excel spreadsheets', 'Spreadsheet cleanup', 'Research formatting', 'Report formatting'],
    price: 'From KSh 150 per task',
  },
}

const informationPages = {
  'how-it-works': { title: 'How TYPEARENA HUB Works | Online Digital Services in Kenya', description: 'Learn how to submit a request, receive a quotation, review a watermarked preview, confirm payment and receive completed work from TYPEARENA HUB.', heading: 'A clear process.\nA better way to get work done.', kicker: 'HOW IT WORKS', intro: 'From your first request to final delivery, TYPEARENA HUB keeps the process clear and easy to follow.', sections: [['Request submitted', 'Choose a service, explain what you need, provide your deadline and attach any relevant files.'], ['Request reviewed', 'Our team checks the request, instructions, files and timing so we understand the work properly.'], ['Quotation issued', 'We prepare a quotation with the scope, price, expected completion time and payment instructions.'], ['Quotation accepted', 'Review the quotation in the customer portal and accept it when the details are correct.'], ['Work in progress', 'We begin the agreed work and keep the order status updated through the customer portal.'], ['Work completed', 'The requested work is completed and prepared for customer review.'], ['Preview ready', 'Where supported, we upload a compressed, watermarked preview so you can review the work before payment.'], ['Payment submitted', 'After reviewing the preview, pay using the provided instructions and submit the M-Pesa transaction reference.'], ['Payment confirmed', 'An administrator checks the payment and confirms it manually. Clicking a button without payment does not unlock files.'], ['Files delivered', 'After confirmation, the original completed files are unlocked in the customer portal for download.']] },
  about: { title: 'About TYPEARENA HUB | Digital Support Services in Kenya', description: 'Learn about TYPEARENA HUB, an online digital support service providing typing, documents, CVs, applications, presentations and data assistance in Kenya.', heading: 'Digital work should feel\nstraightforward.', kicker: 'ABOUT TYPEARENA HUB', intro: 'TYPEARENA HUB helps customers handle everyday digital work with practical support, clear communication and careful document handling.', sections: [['Practical digital help', 'We support typing, formatting, CVs, online applications, presentations, graphic design, data entry and administrative tasks.'], ['Clear quotations', 'Every request is reviewed before a final quotation is issued, so customers understand the work and expected payment before proceeding.'], ['Responsible handling', 'Customer documents stay within the order workflow and are delivered through the customer portal after payment is confirmed.']] },
  faq: { title: 'Frequently Asked Questions | TYPEARENA HUB Kenya', description: 'Answers about TYPEARENA HUB services, quotations, previews, payments, document handling and customer portal delivery in Kenya.', heading: 'Questions,\nanswered.', kicker: 'FREQUENTLY ASKED QUESTIONS', intro: 'Find quick answers about requesting services, reviewing work and receiving completed files.', sections: [['How do I receive a quotation?', 'Submit your request and our team will review the details before sending a quotation through the customer portal.'], ['Can I review work before paying?', 'For supported files, we provide a compressed, watermarked preview. The original file remains locked until an administrator confirms payment.'], ['How do I pay?', 'The portal shows the available payment instructions. Submit your M-Pesa transaction code, then TYPEARENA HUB verifies it manually.'], ['How do I receive completed work?', 'After payment is confirmed, the customer portal unlocks the completed files for download.'], ['What files can I upload?', 'You can upload up to 10 files, with each file up to 20MB and a combined limit of 100MB.'], ['Can screenshots be blocked?', 'No website can completely prevent screenshots, but previews are compressed and watermarked to discourage unauthorized use.']] },
}

const absoluteUrl = (path = '/') => {
  const configured = String(import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')
  return `${configured || window.location.origin}${path}`
}

const upsertMeta = (selector, attributes, content) => {
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

export function setSeo({ title, description = defaultDescription, path = '/', type = 'website', schema }) {
  document.title = title
  const url = absoluteUrl(path)
  let canonical = document.head.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.rel = 'canonical'
    document.head.appendChild(canonical)
  }
  canonical.href = url
  upsertMeta('meta[name="description"]', { name: 'description' }, description)
  upsertMeta('meta[property="og:title"]', { property: 'og:title' }, title)
  upsertMeta('meta[property="og:description"]', { property: 'og:description' }, description)
  upsertMeta('meta[property="og:type"]', { property: 'og:type' }, type)
  upsertMeta('meta[property="og:url"]', { property: 'og:url' }, url)
  upsertMeta('meta[property="og:image"]', { property: 'og:image' }, absoluteUrl('/typearena-logo.svg'))
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title)
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, description)
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, absoluteUrl('/typearena-logo.svg'))
  let structuredData = document.head.querySelector('script[data-seo-schema]')
  if (!structuredData) {
    structuredData = document.createElement('script')
    structuredData.type = 'application/ld+json'
    structuredData.dataset.seoSchema = 'true'
    document.head.appendChild(structuredData)
  }
  structuredData.textContent = JSON.stringify(schema)
}

export const homeSeo = (settings = {}) => ({
  title: `${settings.business_name || siteName} | Online Digital Services in Kenya`,
  description: settings.tagline ? `${settings.tagline}. ${defaultDescription}` : defaultDescription,
  path: '/',
  schema: {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${absoluteUrl('/')}#organization`, name: settings.business_name || siteName, url: absoluteUrl('/'), logo: absoluteUrl('/typearena-logo.svg'), telephone: settings.whatsapp ? `+${String(settings.whatsapp).replace(/\D/g, '')}` : '+254700384172' },
      { '@type': 'ProfessionalService', '@id': `${absoluteUrl('/')}#business`, name: settings.business_name || siteName, url: absoluteUrl('/'), description: defaultDescription, areaServed: { '@type': 'Country', name: 'Kenya' }, telephone: settings.whatsapp ? `+${String(settings.whatsapp).replace(/\D/g, '')}` : '+254700384172', priceRange: 'KSh' },
      { '@type': 'WebSite', '@id': `${absoluteUrl('/')}#website`, name: settings.business_name || siteName, url: absoluteUrl('/') },
    ],
  },
})

export const servicesSeo = {
  title: 'Digital Services in Kenya | TYPEARENA HUB',
  description: 'Explore typing, document formatting, CV, online application, presentation, graphic design and data entry services from TYPEARENA HUB in Kenya.',
  path: '/services',
  schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'TYPEARENA HUB services', description: 'Digital services in Kenya', url: absoluteUrl('/services'), isPartOf: { '@type': 'WebSite', name: siteName, url: absoluteUrl('/') } },
}

export { defaultDescription, servicePages }
export { informationPages }
