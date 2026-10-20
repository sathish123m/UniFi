# Email delivery

## Why OTP mail was landing in Spam / Quarantine

The app sends as `UniFi <unifi.campus@gmail.com>`.

`gmail.com` publishes `v=DMARC1; p=none`. A third-party ESP (Mailjet, Brevo,
Resend, SendGrid…) cannot DKIM-sign `gmail.com`, because it does not control
Google's DNS. The From domain is therefore neither SPF- nor DKIM-aligned.

Observed on 2026-10-20:

| Path | Result |
|---|---|
| Mailjet API → `unifi.campus@gmail.com` | accepted (`status=sent`), **filed under Gmail Spam** (all 3 messages) |
| Gmail SMTP → `unifi.campus@gmail.com` | delivered to the **inbox** |
| Mailjet API → `sathishkumar.2024@lpu.in` | accepted, **never delivered**: `lpu.in` is Microsoft 365 (`lpu-in.mail.protection.outlook.com`), which quarantines unauthenticated `gmail.com` senders as spoofing |

So the application code was fine: the OTP was created (`otp_codes`) and the
provider returned `sent`. The receiving mail server dropped it.

This is a property of the From domain, not of the provider. Switching from
Mailjet to Brevo/SendGrid/Resend does **not** fix it; they all fail the same
alignment check.

## Two working options

1. **Send from a domain you control** with SPF + DKIM (best, needs a domain and
   DNS access). Then any ESP works, including Mailjet.
2. **Send through Google** with the existing `@gmail.com` account (no domain
   needed). The message leaves Gmail's own infrastructure, so SPF and DKIM pass
   and mail is delivered like normal Gmail. This repository ships this option as
   `EMAIL_PROVIDER=GMAIL_SCRIPT`.

## Option 2 setup (about 3 minutes)

1. Open <https://script.google.com> while signed in as `unifi.campus@gmail.com`
   and create a **New project**.
2. Replace the contents of `Code.gs` with:

   ```javascript
   const SECRET = 'PASTE_A_LONG_RANDOM_STRING_HERE'

   function doPost(e) {
     try {
       const body = JSON.parse(e.postData.contents)
       if (body.secret !== SECRET) {
         return ContentService.createTextOutput('forbidden')
       }
       MailApp.sendEmail({
         to: body.to,
         subject: body.subject,
         body: body.text || 'Your UniFi verification code is in the HTML part.',
         htmlBody: body.html,
         name: 'UniFi',
       })
       return ContentService.createTextOutput('ok')
     } catch (err) {
       return ContentService.createTextOutput('error: ' + err.message)
     }
   }
   ```

3. **Deploy → New deployment → Web app**:
   - *Execute as*: **Me** (`unifi.campus@gmail.com`)
   - *Who has access*: **Anyone**
   - Deploy, authorize the scopes Google asks for (this is the Gmail account's
     own permission to send mail as itself), and copy the **`/exec` URL**.
4. Set on the backend and redeploy:

   ```
   EMAIL_PROVIDER=GMAIL_SCRIPT
   GMAIL_SCRIPT_URL=https://script.google.com/macros/s/AKfy…/exec
   GMAIL_SCRIPT_SECRET=<the same string as SECRET above>
   ```

5. Verify:

   ```bash
   cd backend
   npm run mail:test -- you@example.com
   ```

Quota: a consumer Gmail account can send **100 recipients/day** through Apps
Script. That is far above OTP traffic for this deployment; if it is ever
exceeded, the provider chain falls through to the next configured provider.

## Notes

- `EMAIL_PROVIDER` only chooses the **first** transport. Any provider with
  credentials stays in the chain as a fallback, so a Google outage does not
  block OTP delivery.
- Keep `SMTP_VERIFY_ON_STARTUP=false` on Render: outbound SMTP (25/465/587) is
  blocked there, so SMTP can only contribute connection timeouts.
- Never set `EXPOSE_DEV_OTP=true` in production. It returns the OTP in the API
  response and allows account takeover.
