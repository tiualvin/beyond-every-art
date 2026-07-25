// A dependency-free Payload email adapter backed by Resend's HTTP API.
//
// Payload needs an email adapter to send admin password-reset and verification
// mail. Rather than pull in Nodemailer and an SMTP transport, this posts to
// Resend's REST endpoint with the global fetch, matching how the backup
// pipeline talks to R2. Configure it with RESEND_API_KEY, EMAIL_FROM_ADDRESS,
// and EMAIL_FROM_NAME; when the key is unset the factory returns null so the
// app can boot without email (e.g. local development and CI).

import type { PayloadEmailAdapter, SendEmailOptions } from 'payload'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

type Address = SendEmailOptions['to']

/** Normalize Nodemailer-style address inputs to the string(s) Resend expects. */
export function toAddresses(value: Address): string[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object' && 'address' in entry) {
        return entry.name ? `${entry.name} <${entry.address}>` : entry.address
      }
      return ''
    })
    .filter(Boolean)
}

/**
 * Build the Resend email adapter, or return null when RESEND_API_KEY is unset
 * so the caller can omit email configuration entirely.
 */
export function resendAdapter(): PayloadEmailAdapter | null {
  const apiKey = process.env.RESEND_API_KEY
  const defaultFromAddress = process.env.EMAIL_FROM_ADDRESS
  if (!apiKey || !defaultFromAddress) return null

  const defaultFromName = process.env.EMAIL_FROM_NAME || 'Beyond Every Art'

  return () => ({
    name: 'resend',
    defaultFromAddress,
    defaultFromName,
    sendEmail: async (message: SendEmailOptions) => {
      const from =
        typeof message.from === 'string' && message.from
          ? message.from
          : `${defaultFromName} <${defaultFromAddress}>`

      const payload: Record<string, unknown> = {
        from,
        to: toAddresses(message.to),
        subject: message.subject ?? '',
      }
      if (message.html) payload.html = message.html
      if (message.text) payload.text = message.text
      const cc = toAddresses(message.cc)
      const bcc = toAddresses(message.bcc)
      const replyTo = toAddresses(message.replyTo)
      if (cc.length) payload.cc = cc
      if (bcc.length) payload.bcc = bcc
      if (replyTo.length) payload.reply_to = replyTo

      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(
          `Resend send failed: ${response.status} ${response.statusText}` +
            (detail ? `\n${detail}` : ''),
        )
      }
      return response.json().catch(() => ({}))
    },
  })
}
