import React, { useEffect, useState } from 'react'
import { parsePricing } from './pricing.js'

const groups = [
  ['Document services', 'Typing, formatting, editing and file conversion.', ['Typing & formatting', 'CV creation', 'Cover letter', 'PDF editing', 'Document conversion']],
  ['Applications and forms', 'Online applications, registrations and submissions handled with care.', ['Online applications', 'Registration forms', 'Application assistance', 'Form filling', 'Online account assistance']],
  ['Creative digital work', 'Presentations, CVs, posters and documents that look as good as they read.', ['PowerPoint presentations', 'Posters', 'Flyers', 'Graphic design', 'Social media designs', 'CV design/redesign']],
  ['Data and administrative support', 'Accurate data entry, research and everyday online tasks done for you.', ['Data entry', 'Excel spreadsheets', 'Research formatting', 'Reports', 'Basic data analysis']],
]

const pricingGroups = [
  ['Document services', [['Typing', 'KSh 15/page'], ['Document formatting', 'KSh 15/page'], ['CV creation', 'KSh 250'], ['Cover letter', 'KSh 100'], ['PDF editing', 'KSh 30'], ['Document conversion', 'KSh 30/document']]],
  ['Applications and forms', [['Online applications', 'KSh 100/application'], ['Registration forms', 'KSh 30/form'], ['Application assistance', 'KSh 100'], ['Form filling', 'KSh 30/form'], ['Online account assistance', 'KSh 100']]],
  ['Creative digital work', [['PowerPoint presentations', 'KSh 300/presentation'], ['Posters', 'KSh 200/design'], ['Flyers', 'KSh 200/design'], ['Graphic design', 'KSh 200/design'], ['Social media designs', 'KSh 150/design'], ['CV design/redesign', 'KSh 200']]],
  ['Data and administrative support', [['Data entry', 'KSh 150/task'], ['Excel spreadsheets', 'KSh 150/task'], ['Research formatting', 'KSh 150'], ['Report formatting', 'KSh 150'], ['Basic data analysis', 'KSh 300/task']]],
]

export default function ServicesPage({ onOrder }) {
  const [pricing, setPricing] = useState(parsePricing())
  useEffect(() => { fetch('/api/settings').then((response) => response.ok ? response.json() : null).then((data) => data?.pricing && setPricing(parsePricing(data.pricing))).catch(() => {}) }, [])
  return <main className="services-page"><div className="services-page-head"><a className="services-back" href="/">← TYPEARENA HUB</a><div className="kicker">OUR SERVICES</div><h1>Digital work,<br /><em>sorted.</em></h1><p>Choose a service category to see what TYPEARENA HUB can help you with. If you do not see your task, send a custom request.</p><button className="button orange services-request-button" onClick={onOrder}>Request a service ↗</button></div><section className="services-directory" aria-label="Available services">{groups.map(([title, description, items], index) => <details key={title} open={index === 0}><summary><span><small>0{index + 1}</small>{title}</span><b>+</b></summary><div><p>{description}</p><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul><button className="button orange" onClick={onOrder}>Request this service ↗</button></div></details>)}</section><section className="starting-prices" aria-labelledby="starting-prices-title"><div className="kicker">STARTING PRICES</div><h2 id="starting-prices-title">Clear starting points.<br /><em>Final quote after review.</em></h2><p className="pricing-note">These are starting prices, not fixed prices. Your final quotation depends on page count, layout, tables, images, complexity and deadline.</p><div className="pricing-grid">{pricingGroups.map(([title, items]) => <article className="pricing-card" key={title}><h3>{title}</h3><dl>{items.map(([service, fallback]) => <div key={service}><dt>{service}</dt><dd>{pricing[service] || fallback}</dd></div>)}</dl></article>)}</div></section><a className="services-home-link" href="/">Return to homepage</a></main>
}
