# Cas' Cakes

A modern custom-cake storefront based on the real Cas' Cakes menu and gallery. Customers can choose a cake occasion, size, flavor, filling, frosting, and pickup or delivery, then request a quote from Cas.

## Run locally

Requires Node.js 18 or newer. Copy `.env.example` to `.env`, then run:

```sh
npm start
```

Open http://localhost:3000.

## Order and payment flow

- Cake requests open a prefilled email to `cascakes16@outlook.com`. A request is not an order until Cas confirms the design and final quote.
- The site shows the actual starting prices: 6-inch round $35, 8-inch round $45, 10-inch round $55, quarter sheet $50, and half sheet $75. Custom design may change the final price.
- Delivery is limited to 30 miles from Lytle and is configured at `$2 per mile` by default. Customers provide the delivery address; Cas confirms that it is in range and the final delivery charge before accepting an order.
- For an approved quote, the server can create a Square-hosted payment link at `POST /api/payment-link`. This endpoint requires a bearer `SQUARE_ADMIN_KEY`, a confirmed amount in cents, and configured Square credentials. It is not exposed to the public order form.
- Add `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID` from the Square Developer Dashboard when ready. Generate a separate private `SQUARE_ADMIN_KEY` for this site and add all three values to the host's secret environment settings. Keep credentials server-side, test with `SQUARE_ENVIRONMENT=sandbox`, and switch to `production` only when ready.

The Square access token is never sent to the browser. The site can be deployed without Square credentials; payment links remain unavailable until they are added.

## Deploy on Render

The root `render.yaml` configures a Node web service, sets the delivery rate to `$2 per mile`, and attaches `www.cascakeslytle.com` (Render also adds the root domain and redirects it to `www`). To deploy, push this repository to a Git provider, then create a Render Blueprint from the repository. The Render service hostname is assigned during setup; use the exact hostname shown in its dashboard for the `www` CNAME.

After the service is deployed, Render's DNS instructions for this setup are:

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.24.57.1` |
| CNAME | `www` | The service's assigned `*.onrender.com` hostname |

Remove any `AAAA` records for the website hostnames while configuring Render. Preserve existing MX and TXT records so email continues to work. If the DNS provider is Cloudflare, follow Render's Cloudflare instructions for the root domain instead of adding the A record above. After DNS changes propagate, verify both domains in Render to enable HTTPS. The free Render service may spin down when idle; choose a paid plan if continuous availability is required.
