export const defaultPricing = [
  ['Typing', 'KSh 15/page'],
  ['Document formatting', 'KSh 15/page'],
  ['CV creation', 'KSh 250'],
  ['Cover letter', 'KSh 100'],
  ['PDF editing', 'KSh 30'],
  ['Document conversion', 'KSh 30/document'],
  ['Online applications', 'KSh 100/application'],
  ['Registration forms', 'KSh 30/form'],
  ['Application assistance', 'KSh 100'],
  ['Form filling', 'KSh 30/form'],
  ['Online account assistance', 'KSh 100'],
  ['PowerPoint presentations', 'KSh 300/presentation'],
  ['Posters', 'KSh 200/design'],
  ['Flyers', 'KSh 200/design'],
  ['Graphic design', 'KSh 200/design'],
  ['Social media designs', 'KSh 150/design'],
  ['CV design/redesign', 'KSh 200'],
  ['Data entry', 'KSh 150/task'],
  ['Excel spreadsheets', 'KSh 150/task'],
  ['Research formatting', 'KSh 150'],
  ['Report formatting', 'KSh 150'],
  ['Basic data analysis', 'KSh 300/task'],
]

export const defaultPricingText = defaultPricing.map(([service, price]) => `${service} | ${price}`).join('\n')

export const parsePricing = (value) => {
  const result = Object.fromEntries(defaultPricing)
  String(value || '').split('\n').forEach((line) => {
    const [service, price] = line.split('|').map((part) => part.trim())
    if (service && price) result[service] = price
  })
  result['CVs and resumes'] = result['CV creation']
  result['Letters'] = result['Cover letter']
  result['Posters and flyers'] = result.Posters
  result['CV design'] = result['CV design/redesign']
  return result
}
