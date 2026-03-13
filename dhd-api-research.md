# DHD / Ecotrack API Research — COMPLETE

## DHD Provider Details
- **API Domain**: `https://dhd.ecotrack.dz/`
- **Website**: `https://dhd-dz.com/`
- **API Docs**: `https://dhd-dz.com/`
- **Tracking URL**: `https://suivi.ecotrack.dz/suivi/`
- **Logo**: `https://dhd-dz.com/assets/img/logo.png`
- Uses EcotrackProviderIntegration (same as other Ecotrack-based providers)

## Auth Pattern
```
headers: {
  'Authorization': 'Bearer ' + token,
  'Content-Type': 'application/json'
}
```

## API Endpoints
Base: `https://dhd.ecotrack.dz/`

1. **Test Credentials**: `GET api/v1/get/wilayas` — tests token, returns wilayas
2. **Get Rates/Fees**: `GET api/v1/get/fees` — shipping rates by wilaya
3. **Create Order**: `POST api/v1/create/order` — create delivery order
4. **Order Label**: `GET api/v1/get/order/label?tracking={orderId}` — shipping label PDF

## CRITICAL: getOrder NOT IMPLEMENTED
The Ecotrack integration does NOT have a getOrder endpoint to fetch order status.
This means we CANNOT pull delivery status/problem orders via the documented API.

## HOWEVER — Tracking URL exists
`https://suivi.ecotrack.dz/suivi/` — this is a web-based tracking page.
We might be able to:
1. Scrape the tracking page for status
2. Check if there's an undocumented API behind the tracking page
3. Ask Boss if DHD has a separate dashboard/API for bulk status

## What we need from Boss:
1. DHD API token (Bearer token)
2. Does DHD have a dashboard where you can export order statuses?
3. Do they have any other API documentation beyond Ecotrack?
