import React from 'react'

const groups = [
  ['Document services', 'Typing, formatting, editing and file conversion.', ['Typing & formatting', 'CVs and resumes', 'Letters', 'PDF editing', 'Document conversion']],
  ['Applications and forms', 'Online applications, registrations and submissions handled with care.', ['Online applications', 'Registration forms', 'Application assistance', 'Form filling', 'Online account assistance']],
  ['Creative digital work', 'Presentations, CVs, posters and documents that look as good as they read.', ['PowerPoint presentations', 'Posters and flyers', 'Graphic design', 'Social media designs', 'CV design']],
  ['Data and admin support', 'Accurate data entry, research and everyday online tasks done for you.', ['Data entry', 'Excel spreadsheets', 'Research formatting', 'Reports', 'Basic data analysis']],
]

export default function ServicesPage({ onOrder }) {
  return <main className="services-page"><div className="services-page-head"><a className="services-back" href="/">← TYPEARENA HUB</a><div className="kicker">OUR SERVICES</div><h1>Digital work,<br /><em>sorted.</em></h1><p>Choose a service category to see what TYPEARENA HUB can help you with. If you do not see your task, send a custom request.</p><button className="button orange services-request-button" onClick={onOrder}>Request a service ↗</button></div><section className="services-directory" aria-label="Available services">{groups.map(([title, description, items], index) => <details key={title} open={index === 0}><summary><span><small>0{index + 1}</small>{title}</span><b>+</b></summary><div><p>{description}</p><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul><button className="button orange" onClick={onOrder}>Request this service ↗</button></div></details>)}</section><a className="services-home-link" href="/">Return to homepage</a></main>
}
