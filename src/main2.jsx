import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './responsive.css'
import './admin-symbol.css'
import AdminPanel from './AdminPanelV3.jsx'
import AdminSettings from './AdminSettings.jsx'
import CustomerPortal from './CustomerPortal.jsx'
import LegalModal from './LegalModal.jsx'
import OrderForm from './OrderForm.jsx'
import PublicFooter from './PublicFooter.jsx'
import ServicesPage from './ServicesPage.jsx'
import ErrorPage from './ErrorPage.jsx'

const Arrow = () => <span aria-hidden="true">↗</span>
const WhatsAppIcon = () => <svg className="whatsapp-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.52 3.48A11.82 11.82 0 0 0 12.08 0C5.53 0 .2 5.33.2 11.88c0 2.09.55 4.13 1.6 5.93L.1 24l6.33-1.66a11.86 11.86 0 0 0 5.65 1.43h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.18-1.24-6.16-3.45-8.41ZM12.09 21.72h-.01a9.83 9.83 0 0 1-5.01-1.37l-.36-.21-3.76.99 1-3.66-.23-.38a9.82 9.82 0 0 1-1.5-5.21C2.22 6.46 6.65 2.03 12.09 2.03c2.64 0 5.12 1.03 6.98 2.9a9.8 9.8 0 0 1 2.89 6.97c0 5.44-4.43 9.87-9.87 9.87Zm5.41-7.4c-.3-.15-1.78-.88-2.05-.98-.27-.1-.47-.15-.67.15-.2.3-.77.98-.94 1.18-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.09 4.5.71.31 1.27.49 1.7.63.72.23 1.38.2 1.9.12.58-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.17-1.43-.07-.13-.27-.2-.56-.35Z" /></svg>
const normalizePhone = (value) => { const digits = String(value || '').replace(/\D/g, ''); return digits.startsWith('0') ? `254${digits.slice(1)}` : digits }
const uploadOrder = (form) => new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/orders'); xhr.upload.onprogress = (event) => { if (event.lengthComputable) window.dispatchEvent(new CustomEvent('order-upload-progress', { detail: Math.round((event.loaded / event.total) * 100) })) }; xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, json: async () => JSON.parse(xhr.responseText || '{}') }); xhr.onerror = () => reject(new Error('The request could not be saved. Please check your connection and try again.')); xhr.send(form) })
const services = [
  ['01', 'Document services', 'Typing, formatting, editing and file conversion - clean and ready to send.', '▤'],
  ['02', 'Applications and forms', 'Online applications, registrations and submissions handled with care.', '⌁'],
  ['03', 'Creative digital work', 'Presentations, CVs, posters and documents that look as good as they read.', '✦'],
  ['04', 'Data and admin support', 'Accurate data entry, research and everyday online tasks done for you.', '⌘'],
]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [submittedOrder, setSubmittedOrder] = useState(null)
  const [submittingOrder, setSubmittingOrder] = useState(false)
  const [copiedReference, setCopiedReference] = useState(false)
  const [contactSettings, setContactSettings] = useState({ email: '', operating_hours: 'Online every day', whatsapp: '254762220299' })
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => { const openPrivacy = () => setLegalOpen('privacy'); window.addEventListener('open-privacy', openPrivacy); return () => window.removeEventListener('open-privacy', openPrivacy) }, [])
  useEffect(() => { const online = () => setOffline(false); const offlineEvent = () => setOffline(true); window.addEventListener('online', online); window.addEventListener('offline', offlineEvent); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent) } }, [])
  useEffect(() => {
    fetch('/api/settings').then((response) => response.ok ? response.json() : null).then((data) => data && setContactSettings((current) => ({ ...current, ...data }))).catch(() => {})
    const saved = JSON.parse(localStorage.getItem('typearena-active-order') || 'null')
    if (!saved) return
    fetch(`/api/orders/${saved.reference}/tracking?phone=${encodeURIComponent(saved.phone || '')}`).then((response) => response.ok ? response.json() : null).then((tracking) => {
      if (!tracking || !['Completed', 'Delivered'].includes(tracking.status)) setSubmittedOrder(saved)
      else localStorage.removeItem('typearena-active-order')
    }).catch(() => setSubmittedOrder(saved))
  }, [])
  const scrollTo = (id) => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }
  const openOrder = (service = '') => { setSelectedService(service); setSubmittedOrder(null); setOrderOpen(true) }
  useEffect(() => { const trust = document.querySelector('.trust-section > div:first-child'); if (!trust) return undefined; trust.querySelectorAll('.testimonial-note').forEach((note) => note.remove()); let entries = []; try { entries = String(contactSettings.testimonials || '').split('\n').map((line) => line.split('|').map((part) => part.trim())).filter((parts) => parts[0] && parts[1]) } catch { entries = [] } if (!entries.length) return undefined; entries.slice(0, 3).forEach(([quote, name, role]) => { const note = document.createElement('div'); note.className = 'testimonial-note'; note.innerHTML = `<span>“${quote.replace(/[<>]/g, '')}”</span><strong>${name.replace(/[<>]/g, '')}${role ? ` · ${role.replace(/[<>]/g, '')}` : ''}</strong>`; trust.appendChild(note) }); return () => trust.querySelectorAll('.testimonial-note').forEach((note) => note.remove()) }, [contactSettings.testimonials])
  useEffect(() => { const details = { 'Document services': ['Typing & formatting', 'CVs and resumes', 'Letters', 'PDF editing', 'Document conversion'], 'Applications and forms': ['Online applications', 'Registration forms', 'Application assistance', 'Form filling', 'Online account assistance'], 'Creative digital work': ['PowerPoint presentations', 'Posters and flyers', 'Graphic design', 'Social media designs', 'CV design'], 'Data and admin support': ['Data entry', 'Excel spreadsheets', 'Research formatting', 'Reports', 'Basic data analysis'] }; const cards = Array.from(document.querySelectorAll('.service-card')); cards.forEach((card) => { if (card.querySelector('.service-details')) return; const title = card.querySelector('h3')?.textContent; const items = details[title] || []; if (!items.length) return; const disclosure = document.createElement('details'); disclosure.className = 'service-details'; const summary = document.createElement('summary'); summary.textContent = 'See included services'; disclosure.appendChild(summary); const list = document.createElement('ul'); items.forEach((item) => { const entry = document.createElement('li'); entry.textContent = item; list.appendChild(entry) }); disclosure.appendChild(list); card.insertBefore(disclosure, card.querySelector('button')); }); return () => cards.forEach((card) => card.querySelector('.service-details')?.remove()) }, [])
  useEffect(() => { const link = document.querySelector('.nav button'); if (!link) return undefined; const openServices = () => { window.location.href = '/services' }; link.addEventListener('click', openServices); return () => link.removeEventListener('click', openServices) }, [])
  useEffect(() => { const heroButton = document.querySelector('.hero-actions .button.orange'); if (heroButton) heroButton.childNodes[0].textContent = 'Request a service '; const orderButton = document.querySelector('.order-card:not(.confirmation) .button.dark'); if (orderButton) orderButton.childNodes[0].textContent = 'Request a service '; const contactButton = document.querySelector('.contact-card .button.orange'); if (contactButton) contactButton.childNodes[0].textContent = 'Request a service '; const processText = document.querySelector('.step p'); if (processText) processText.textContent = 'Click Request a service, choose a category, explain what you need, add your deadline, and attach your files.' }, [])
  const submitOrder = async (event) => {
    event.preventDefault()
    if (submittingOrder) return
    setSubmittingOrder(true)
    setSubmitError('')
    const form = new FormData(event.currentTarget)
    const specificService = form.get('specific_service')
    if (specificService) form.set('instructions', `Specific service: ${specificService}\n\n${form.get('instructions')}`)
    try {
      const response = await uploadOrder(form)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The request could not be saved. Please try again.')
      form.set('phone', normalizePhone(form.get('phone')))
      const activeOrder = { ...data, phone: form.get('phone') }
      localStorage.setItem('typearena-active-order', JSON.stringify(activeOrder))
      localStorage.removeItem('typearena-request-draft')
      setSubmittedOrder(activeOrder); setOrderOpen(false)
    } catch (cause) {
      setSubmitError(cause.message)
    } finally {
      setSubmittingOrder(false)
    }
  }
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll('.service-card, .step, .trust-item, .about, .order-card'))
    if (!targets.length || !('IntersectionObserver' in window)) return undefined
    targets.forEach((target, index) => { target.classList.add('reveal-target'); target.style.setProperty('--reveal-delay', `${(index % 4) * 70}ms`) })
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target) } }), { threshold: 0.12 })
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])
  if (offline) return <ErrorPage offline />
  if (window.location.pathname === '/services') return <ServicesPage onOrder={() => { window.location.href = '/#order' }} />
  if (window.location.pathname !== '/') return <ErrorPage />
  return <div className="site-shell">{submitError && <div className="global-submit-error" role="alert">{submitError}</div>}
    <header className="topbar"><button className="logo" onClick={() => scrollTo('top')} aria-label="TYPEARENA HUB home"><span className="logo-mark">T</span><span>TYPEARENA <b>HUB</b></span></button><button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? '×' : '☰'}</button><nav className={menuOpen ? 'nav open' : 'nav'}><button onClick={() => scrollTo('services')}>Services</button><button onClick={() => scrollTo('how-it-works')}>How it works</button><button onClick={() => scrollTo('about')}>About us</button></nav><button className="nav-track" onClick={() => setPortalOpen(true)}>Track an order</button><button className="nav-cta" onClick={() => openOrder()}>Get started <Arrow /></button></header>
    <main id="top">
      <div className="track-banner wrap"><span>Already sent a request?</span><button onClick={() => setPortalOpen(true)}>Track an order <Arrow /></button></div>
      <section className="hero wrap"><div className="hero-copy"><div className="kicker"><span className="pulse" /> ONLINE DIGITAL SERVICES</div><h1>Your Cyber.<br /><em>Online.</em></h1><p className="hero-lede">Get typing, presentations, document formatting, data entry and digital services without leaving your room.</p><div className="hero-actions"><button className="button orange" onClick={() => openOrder()}>Order a service <Arrow /></button><a className="whatsapp-link" href="https://wa.me/254762220299" target="_blank" rel="noreferrer"><span className="wa">◔</span> Chat on WhatsApp</a></div><div className="hero-note"><span className="mini-avatars"><i>✦</i><i>✓</i><i>+</i></span><span>Trusted digital help, right when you need it.</span></div></div><div className="hero-visual" aria-label="TYPEARENA HUB digital workspace illustration"><div className="orange-orb orb-one" /><div className="orange-orb orb-two" /><div className="paper paper-back"><span>TYPEARENA HUB</span><strong>PROJECT<br />BRIEF</strong><small>your work, handled.</small></div><div className="paper paper-front"><div className="paper-top"><span className="tiny-logo">T</span><span>DOCUMENT / 001</span></div><div className="paper-lines"><b /><b /><b /><b /><i /><i /></div><div className="paper-stamp">READY<br /><small>TO SEND</small></div></div><div className="laptop"><div className="screen"><div className="screen-head"><span>typearena hub</span><span className="screen-dot" /></div><div className="screen-layout"><div className="screen-sidebar"><b /><b /><b /><b /></div><div className="screen-content"><small>YOUR REQUEST</small><h3>Presentation<br />design</h3><div className="progress"><span /></div><p>In progress <strong>72%</strong></p></div></div></div><div className="laptop-base" /></div><span className="float-label label-top">YOUR WORK. <b>OUR CARE.</b></span><span className="float-label label-bottom">FAST - PROFESSIONAL - ONLINE</span></div></section>
      <section className="trust-strip"><div className="wrap trust-inner"><span>WHAT WE DO</span><i /><span>Digital tasks made simple</span><i /><span>Available online, every day</span><i /><span>Made for your peace of mind</span></div></section>
      <section className="services wrap" id="services"><div className="section-intro"><div><div className="kicker">OUR SERVICES</div><h2>Bring the task.<br /><em>We will take it from here.</em></h2></div><p>Small task or big deadline, TYPEARENA HUB gives you the extra pair of digital hands you need.</p></div><div className="service-grid">{services.map(([number, title, text, icon]) => <article className="service-card" key={title}><div className="service-top"><span className="service-number">{number}</span><span className="service-icon">{icon}</span></div><h3>{title}</h3><p>{text}</p><button onClick={() => openOrder(title)}>Request this <Arrow /></button></article>)}</div></section>
      <section className="process" id="how-it-works"><div className="wrap process-inner"><div><div className="kicker">HOW IT WORKS</div><h2>Simple in.<br /><em>Sorted out.</em></h2><p className="process-intro">Submit your request on the website, then use the visible <button className="process-link" onClick={() => setPortalOpen(true)}>Track an order</button> button to find your quotation, payment details, progress, and completed files.</p></div><div className="steps"><div className="step"><span>01</span><div><h3>Submit your request</h3><p>Click Order a service, choose a category, explain what you need, add your deadline, and attach your files.</p></div></div><div className="step"><span>02</span><div><h3>Find your quotation</h3><p><button className="process-link" onClick={() => setPortalOpen(true)}>Track your order</button> with your reference and phone number, then review and accept the quotation.</p></div></div><div className="step"><span>03</span><div><h3>Pay, track and receive</h3><p>Submit your payment reference, follow progress, and download completed work from the same portal.</p></div></div></div></div></section>
      <section className="order wrap" id="order">{submittedOrder ? <div className="order-card confirmation"><div><div className="kicker">REQUEST RECEIVED</div><h2>Order <em>#{submittedOrder.reference}</em></h2><p>Thanks, {submittedOrder.name}. We will review your request and send a custom quotation.</p><div className="confirmation-copy"><button onClick={() => { navigator.clipboard?.writeText(submittedOrder.reference); setCopiedReference(true); setTimeout(() => setCopiedReference(false), 1800) }}>{copiedReference ? 'Copied' : 'Copy reference'}</button><button onClick={() => setPortalOpen(true)}>Track this order</button></div></div><a className="button dark" href={`https://wa.me/254762220299?text=${encodeURIComponent(`Hello TYPEARENA HUB. I submitted order #${submittedOrder.reference} for ${submittedOrder.service}.`)}`} target="_blank" rel="noreferrer">Follow up on WhatsApp <Arrow /></a></div> : <div className="order-card"><div><div className="kicker">READY WHEN YOU ARE</div><h2>Send your work.<br /><em>We will handle it.</em></h2><p>Tell us what you need and get a clear response from our team.</p></div><button className="button dark" onClick={() => openOrder()}>Start a request <Arrow /></button></div>}</section>
      <section className="faq wrap" id="faq"><div className="kicker">GOOD TO KNOW</div><h2>Questions, <em>answered.</em></h2><div className="faq-grid"><details><summary>How do I receive a quotation?</summary><p>Submit your request and our team will review the details before sending a quotation through the customer portal.</p></details><details><summary>How do I track my request?</summary><p>Keep the reference shown after submission. Use Track an order with that reference and the phone number used on the request.</p></details><details><summary>How do I pay?</summary><p>After accepting a quotation, the portal shows the available payment instructions. Submit your M-Pesa transaction code through the portal. Payment must be verified before paid work begins.</p></details><details><summary>How is completed work delivered?</summary><p>The customer portal is the main delivery channel. WhatsApp can be selected as an alternative.</p></details><details><summary>What files can I upload?</summary><p>You can upload up to 10 files, with each file up to 20MB and a combined limit of 100MB. Supported formats include PDF, Word, Excel, PowerPoint, images and ZIP files.</p></details><details><summary>Do I need to provide a deadline?</summary><p>No. A deadline is optional, but providing one helps us understand your preferred timing.</p></details><details><summary>How are my files handled?</summary><p>Uploaded documents remain private within your order workflow. Do not upload passwords, M-Pesa PINs or unrelated sensitive documents.</p></details><details><summary>Can I request revisions?</summary><p>Revision terms are included in the quotation when applicable. Review the quotation before accepting it.</p></details></div></section>
      <section className="trust-section wrap" id="why-choose"><div><div className="kicker">WHY CHOOSE TYPEARENA HUB?</div><h2>Help that feels <em>straightforward.</em></h2><p className="trust-intro">You can send a request online, keep your reference, review a quotation, and return to the portal for updates and completed files.</p></div><div className="trust-grid">{['Convenient online service', 'Personal assistance', 'Transparent quotation before work', 'Private handling of customer documents', 'Reliable communication through your request details', 'Completed work delivered mainly through the customer portal, with WhatsApp as an alternative'].map((item) => <div className="trust-item" key={item}><span>✓</span><strong>{item}</strong></div>)}</div></section>
      <section className="contact-section wrap" id="contact"><div><div className="kicker">CONTACT TYPEARENA HUB</div><h2>Need to ask <em>first?</em></h2><p>Reach us through WhatsApp or use the request form. Current business contact details and operating hours are shown below.</p></div><div className="contact-card"><a href={`https://wa.me/${contactSettings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><span>WhatsApp</span><strong>{contactSettings.whatsapp || '+254 762 220 299'}</strong></a>{contactSettings.email && <a href={`mailto:${contactSettings.email}`}><span>Email</span><strong>{contactSettings.email}</strong></a>}<div><span>Business hours</span><strong>{contactSettings.operating_hours}</strong></div><button className="button orange" onClick={() => openOrder()}>Start a request <Arrow /></button></div></section>
      <section className="about wrap" id="about"><span className="about-mark">T</span><div><div className="kicker">THE TYPEARENA HUB PROMISE</div><p>Digital services should feel easy, thoughtful and within reach. We are here to make online work less stressful - one task at a time.</p></div></section>
    </main>
    <PublicFooter onTrack={() => setPortalOpen(true)} onAdmin={() => setAdminOpen(true)} onPrivacy={() => setLegalOpen('privacy')} onTerms={() => setLegalOpen('terms')} />
    {orderOpen && <OrderForm selectedService={selectedService} busy={submittingOrder} onClose={() => setOrderOpen(false)} onSubmit={submitOrder} />}{adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} onSettings={() => setSettingsOpen(true)} />}{portalOpen && <CustomerPortal onClose={() => setPortalOpen(false)} />}{settingsOpen && <AdminSettings onClose={() => setSettingsOpen(false)} onBack={() => setSettingsOpen(false)} />}{legalOpen && <LegalModal type={legalOpen} onClose={() => setLegalOpen(null)} />}
    <a className="whatsapp-float" href="https://wa.me/254762220299" target="_blank" rel="noreferrer" aria-label="Chat with TYPEARENA HUB on WhatsApp">◔</a>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
