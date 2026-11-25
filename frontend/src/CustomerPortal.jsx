import React, { useEffect, useState } from 'react'

const API_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const readJson = async (response) => {
  const body = await response.text()
  if (!body.trim()) throw new Error(response.ok ? 'The server returned an empty response. Please try again.' : `The server is unavailable (${response.status}).`)
  try { return JSON.parse(body) } catch { throw new Error(`The server returned an invalid response (${response.status}).`) }
}

const Arrow = () => <span aria-hidden="true">&#8599;</span>

const normalizePhone = (value) => { const digits = String(value || '').replace(/\D/g, ''); return digits.startsWith('0') ? `254${digits.slice(1)}` : digits }

export default function CustomerPortal({ onClose }) {
  const [reference, setReference] = useState('')
  const [phone, setPhone] = useState('')
  const [quote, setQuote] = useState(null)
  const [tracking, setTracking] = useState(null)
  const [deliverables, setDeliverables] = useState([])
  const [previews, setPreviews] = useState([])
  const [paymentReference, setPaymentReference] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const closeOnEscape = (event) => event.key === 'Escape' && onClose(); const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', closeOnEscape); return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeOnEscape) } }, [onClose])

  useEffect(() => { const till = Array.from(document.querySelectorAll('.payment-details span')).find((element) => element.textContent.includes('Till number:')); if (!till || till.nextElementSibling?.classList.contains('till-account-name')) return; const name = document.createElement('span'); name.className = 'till-account-name'; name.innerHTML = `Name: <strong>${quote?.tillAccountName || 'Caleb Mulwa Tonny'}</strong>`; till.after(name) }, [quote])

  const lookup = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const ref = reference.trim().toUpperCase()
      const normalizedPhone = normalizePhone(phone)
      const query = `?phone=${encodeURIComponent(normalizedPhone)}`
      const quoteResponse = await fetch(`/api/orders/${ref}/quotation${query}`)
      const quoteData = await readJson(quoteResponse)
      const activeStatuses = ['Payment Confirmed', 'In Progress', 'Completed', 'Delivered']
      if (quoteResponse.ok && quoteData.status === 'Preview Ready') {
        const trackingResponse = await fetch(`/api/orders/${ref}/tracking${query}`)
        const trackingData = await readJson(trackingResponse)
        if (!trackingResponse.ok) throw new Error(trackingData.error || 'We could not load the preview.')
        setQuote(quoteData); setTracking(trackingData); setDeliverables([])
        const previewsResponse = await fetch(`/api/orders/${ref}/previews${query}`)
        if (previewsResponse.ok) setPreviews(await readJson(previewsResponse))
        return
      }
      if (quoteResponse.ok && !activeStatuses.includes(quoteData.status)) { setQuote(quoteData); setTracking(null); return }
      const trackingResponse = await fetch(`/api/orders/${ref}/tracking${query}`)
      const trackingData = await readJson(trackingResponse)
      if (!trackingResponse.ok) throw new Error(trackingData.error || quoteData.error || 'We could not find that order.')
      setTracking(trackingData); setQuote(null); setDeliverables([]); setPreviews([])
      if (['Preview Ready', 'Payment Confirmed', 'In Progress', 'Completed', 'Delivered'].includes(trackingData.status)) {
        const previewsResponse = await fetch(`/api/orders/${ref}/previews${query}`)
        if (previewsResponse.ok) setPreviews(await readJson(previewsResponse))
      }
      if (['Payment Confirmed', 'In Progress', 'Completed', 'Delivered'].includes(trackingData.status)) {
        const filesResponse = await fetch(`/api/orders/${ref}/deliverables${query}`)
        if (filesResponse.ok) setDeliverables(await readJson(filesResponse))
      }
    } catch (cause) { setMessage(cause.message) } finally { setBusy(false) }
  }

  const decide = async (decision) => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/orders/${quote.reference}/quotation/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: normalizePhone(phone), decision }) })
      const data = await readJson(response)
      if (!response.ok) throw new Error(data.error || 'We could not save that decision.')
      if (decision === 'accepted') {
        const trackingResponse = await fetch(`/api/orders/${quote.reference}/tracking?phone=${encodeURIComponent(normalizePhone(phone))}`)
        const trackingData = await readJson(trackingResponse)
        if (trackingResponse.ok) { setTracking(trackingData); setQuote(null); setPreviews([]); setDeliverables([]) }
        else setQuote((current) => ({ ...current, decision, status: data.status }))
      } else setQuote((current) => ({ ...current, decision, status: data.status }))
    } catch (cause) { setMessage(cause.message) } finally { setBusy(false) }
  }

  const submitPayment = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/orders/${quote.reference}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: normalizePhone(phone), reference: paymentReference }) })
      const data = await readJson(response)
      if (!response.ok) throw new Error(data.error || 'We could not submit the payment reference.')
      setQuote((current) => ({ ...current, paymentStatus: data.status }))
      setMessage('Payment reference submitted. TYPEARENA HUB will verify it before the original files are delivered.')
    } catch (cause) { setMessage(cause.message) } finally { setBusy(false) }
  }

  const downloadDeliverable = (file) => {
    if (!tracking) return
    const downloadUrl = `${API_BASE}/api/orders/${tracking.reference}/deliverables/${encodeURIComponent(file.stored_name)}?phone=${encodeURIComponent(normalizePhone(phone))}`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = file.original_name
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const viewPreview = (file) => {
    if (!file.previewAvailable) { setMessage('A preview is not available for this file. Please contact TYPEARENA HUB.'); return }
    const previewUrl = `${API_BASE}/api/orders/${tracking.reference}/previews/${encodeURIComponent(file.preview_stored_name)}?phone=${encodeURIComponent(normalizePhone(phone))}&v=${encodeURIComponent(file.preview_stored_name)}`
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }

  const refreshTracking = async () => {
    if (!tracking || busy) return
    setBusy(true); setMessage('')
    try {
      const normalizedPhone = normalizePhone(phone)
      const response = await fetch(`/api/orders/${tracking.reference}/tracking?phone=${encodeURIComponent(normalizedPhone)}`)
      const data = await readJson(response)
      if (!response.ok) throw new Error(data.error || 'Could not refresh this order.')
      setTracking(data)
      if (['Preview Ready', 'Payment Confirmed', 'In Progress', 'Completed', 'Delivered'].includes(data.status)) {
        const previewsResponse = await fetch(`/api/orders/${tracking.reference}/previews?phone=${encodeURIComponent(normalizedPhone)}`)
        if (previewsResponse.ok) setPreviews(await readJson(previewsResponse))
      }
      if (['Payment Confirmed', 'In Progress', 'Completed', 'Delivered'].includes(data.status)) {
        const filesResponse = await fetch(`/api/orders/${tracking.reference}/deliverables?phone=${encodeURIComponent(normalizedPhone)}`)
        if (filesResponse.ok) setDeliverables(await readJson(filesResponse))
      }
    } catch (cause) { setMessage(cause.message) } finally { setBusy(false) }
  }

  useEffect(() => { if (!tracking) return undefined; const poll = async () => { if (document.hidden || ['Delivered', 'Cancelled', 'Rejected'].includes(tracking.status)) return; try { const normalizedPhone = normalizePhone(phone); const response = await fetch(`/api/orders/${tracking.reference}/tracking?phone=${encodeURIComponent(normalizedPhone)}`); if (!response.ok) return; const data = await readJson(response); const statusChanged = data.status !== tracking.status; setTracking(data); if (statusChanged && ['Preview Ready', 'Payment Confirmed', 'In Progress', 'Completed', 'Delivered'].includes(data.status)) { const previewsResponse = await fetch(`/api/orders/${tracking.reference}/previews?phone=${encodeURIComponent(normalizedPhone)}`); if (previewsResponse.ok) setPreviews(await readJson(previewsResponse)) } if (statusChanged && ['Payment Confirmed', 'In Progress', 'Completed', 'Delivered'].includes(data.status)) { const filesResponse = await fetch(`/api/orders/${tracking.reference}/deliverables?phone=${encodeURIComponent(normalizedPhone)}`); if (filesResponse.ok) setDeliverables(await readJson(filesResponse)) } } catch { /* keep the current status if a background refresh fails */ } }; const interval = window.setInterval(poll, 30000); return () => window.clearInterval(interval) }, [tracking?.reference, tracking?.status, phone])
  const reset = () => { setQuote(null); setTracking(null); setDeliverables([]); setPreviews([]); setMessage('') }
  const previewReady = quote && quote.status === 'Preview Ready'
  const paymentDetails = previewReady && quote.decision === 'accepted' && !quote.paymentStatus

  return <div className="form-overlay"><div className="request-form portal-form">
    {tracking && previews.length > 0 && <PreviewList previews={previews} reference={tracking.reference} phone={phone} paid={['Payment Confirmed', 'In Progress', 'Completed', 'Delivered'].includes(tracking.status)} onPreview={viewPreview} />}
    {tracking && ['Payment Confirmed', 'In Progress'].includes(tracking.status) && deliverables.length > 0 && <DownloadList files={deliverables} onDownload={downloadDeliverable} />}
    <div className="form-head"><div><div className="kicker">CUSTOMER PORTAL</div><h2>Track your<br /><em>order.</em></h2></div><button type="button" className="close-form" onClick={onClose}>&#215;</button></div>
    {!quote && !tracking && <form onSubmit={lookup}><p className="form-note">Use the order reference and phone number from your request confirmation. Your quotation and payment instructions will appear here when ready.</p><label className="portal-label">Order reference<input required value={reference} onChange={(event) => setReference(event.target.value)} placeholder="TH-AB12CD34" /></label><label className="portal-label">Phone number<input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07XX XXX XXX" /></label>{message && <div className="admin-error">{message}</div>}<button className="button orange form-submit" disabled={busy}>{busy ? 'Checking...' : 'View order'} {!busy && <Arrow />}</button></form>}
    {tracking && <div className="tracking-view"><div className="quote-summary"><span>{tracking.reference}</span><strong>{tracking.service}</strong><small>Deadline: {tracking.deadline}</small></div><div className="tracking-status">Current status <b>{tracking.status}</b></div><div className="tracking-list">{tracking.milestones.map((milestone) => <div className={milestone.complete ? 'tracking-step complete' : 'tracking-step'} key={milestone.label}><span>{milestone.complete ? String.fromCharCode(10003) : String.fromCharCode(9675)}</span><strong>{milestone.label}</strong></div>)}</div>{['Completed', 'Delivered'].includes(tracking.status) && <div className="deliverables"><b>Completed files</b>{deliverables.length ? deliverables.map((file) => <button key={file.stored_name} onClick={() => downloadDeliverable(file)}>{file.original_name} <span>{String.fromCharCode(8595)}</span></button>) : <p>Your completed files will appear here once uploaded.</p>}</div>}{message && <div className="admin-error">{message}</div>}<button className="portal-reset" onClick={reset}>Look up another order</button></div>}
    {quote && <div className="quote-view"><div className="quote-summary"><span>{quote.reference}</span><strong>{quote.service}</strong><small>Prepared for {quote.name}</small></div><div className="quote-total"><small>Amount payable</small><b>KSh {Number(quote.final_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></div><dl><div><dt>Completion</dt><dd>{quote.completion_time}</dd></div><div><dt>Payment terms</dt><dd>{quote.payment_terms}</dd></div><div><dt>Valid until</dt><dd>{quote.expiry_date}</dd></div></dl><p className="quote-description">{quote.description}</p>{quote.decision ? <>{paymentDetails && <div className="payment-details"><b>Payment details</b>{quote.paybill && <span>Paybill: <strong>{quote.paybill}</strong></span>}{quote.tillNumber && <span>Till number: <strong>{quote.tillNumber}</strong></span>}{quote.paymentInstructions && <p>{quote.paymentInstructions}</p>}{!quote.paybill && !quote.tillNumber && !quote.paymentInstructions && <p>Payment instructions will be added by TYPEARENA HUB.</p>}</div>}{quote.decision === 'accepted' && previewReady && !quote.paymentStatus ? <form className="payment-form" onSubmit={submitPayment}><div className="form-note">Review the watermarked preview above, then pay using the details provided and enter the M-Pesa transaction code below.</div><label className="portal-label">M-Pesa transaction code<input required value={paymentReference} onChange={(event) => setPaymentReference(event.target.value.toUpperCase())} placeholder="e.g. QWE123ABC" /></label><button className="button orange form-submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit payment reference'} {!busy && <Arrow />}</button></form> : <div className="portal-status">{quote.paymentStatus ? 'Payment reference received - awaiting administrator verification.' : quote.decision === 'accepted' ? 'Quotation accepted. TYPEARENA HUB will prepare your work and make payment available after the preview is ready.' : `Quotation ${quote.decision}.`}</div>}</> : <div className="quote-actions"><button className="button orange" disabled={busy} onClick={() => decide('accepted')}>{busy ? 'Saving...' : 'Accept quotation'} {!busy && <Arrow />}</button><button className="button outline" disabled={busy} onClick={() => decide('declined')}>Decline</button></div>}{message && <div className="admin-error">{message}</div>}<button className="portal-reset" onClick={reset}>Look up another order</button></div>}
    {tracking && <div className="portal-delivery-note">Delivery: <b>{tracking.deliveryMethod === 'WhatsApp' ? 'WhatsApp' : 'Customer portal (main)'}</b></div>}
    {tracking && <button className="refresh-order" onClick={refreshTracking} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh order status'}</button>}
  </div></div>
}

function PreviewList({ previews, paid, onPreview }) {
  return <section className="preview-list" aria-label="Work previews"><div className="kicker">WORK PREVIEW</div><p className="preview-note"><strong>Review the completed work before payment.</strong> Watermarked previews are for review only; original files are released after payment confirmation. For large documents and presentations, selected pages or slides may be shown instead of the complete file.</p>{previews.map((file) => <div className="preview-item" key={file.stored_name}><div><strong>{file.original_name}</strong><small>{file.previewAvailable ? 'Watermarked preview available' : 'Preview unavailable for this file type'}</small></div>{file.previewAvailable && <button className="button outline" type="button" onClick={() => onPreview(file)}>View preview &#8599;</button>}{paid && file.downloadAvailable && <span className="preview-unlocked">Download unlocked below</span>}</div>)}</section>
}

function DownloadList({ files, onDownload }) {
  return <section className="deliverables preview-downloads"><div className="kicker">PAYMENT CONFIRMED</div><b>Your completed files are unlocked.</b>{files.map((file) => <button key={file.stored_name} onClick={() => onDownload(file)}>{file.original_name} <span>&#8595;</span></button>)}</section>
}

