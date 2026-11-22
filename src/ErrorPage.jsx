import React from 'react'

export default function ErrorPage({ offline = false }) {
  return <main className="error-page"><div className="kicker">TYPEARENA HUB</div><h1>{offline ? <>You are<br /><em>offline.</em></> : <>Page not<br /><em>found.</em></>}</h1><p>{offline ? 'Check your connection and try again. Your saved request draft will remain on this device.' : 'The page you requested does not exist or may have moved.'}</p><div><a className="button orange" href="/">Return home ↗</a>{offline && <button className="button outline" onClick={() => window.location.reload()}>Try again</button>}</div></main>
}
